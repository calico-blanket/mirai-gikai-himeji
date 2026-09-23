import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { parseCouncilData } from "../lib/data/schema.ts";
import { validateDiscussions } from "../lib/data/discussion-validation.ts";
import { makeTopicInput, makeTopicRequest, makeTopicRecord, validateTopicCandidates, topicPolicy } from "../lib/data/topic-classification.ts";
import { requestTopicClassification, safeFailureMessage } from "./typesafe-client.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidatePath = resolve(root, "data/candidates/himeji-2025-4-topics.json");
const read = async (path) => JSON.parse((await readFile(resolve(root, path), "utf8")).replace(/^\uFEFF/, ""));

export function parseOptions(args, validIds) {
  let run = false, refresh = false, all = false, selected;
  for (const arg of args) {
    if (arg === "--run" && !run) run = true;
    else if (arg === "--refresh" && !refresh) refresh = true;
    else if (arg === "--all" && !all) all = true;
    else if (arg.startsWith("--items=") && !selected) selected = arg.slice(8).split(",");
    else throw new Error("実行オプションが不正です");
  }
  if (all && selected) throw new Error("対象指定は一種類にしてください");
  const ids = all ? validIds : selected ?? ["bill-135", "bill-140", "bill-154"];
  if (new Set(ids).size !== ids.length || !ids.length || ids.some((id) => !validIds.includes(id))) throw new Error("対象IDが不正です");
  return { run, refresh, ids };
}

export async function loadInputs() {
  const council = parseCouncilData(await read("data/himeji-2025-4.json"));
  const manifest = await read("data/candidates/himeji-2025-4-minutes-sources.json");
  const files = Object.fromEntries(await Promise.all([manifest.indexSource, ...manifest.sources].map(async (source) => {
    if (!/^himeji-2025-4-minutes-(?:index|\d+)\.json$/.test(source.snapshotFile)) throw new Error("原資料パスが不正です");
    const raw = await readFile(resolve(root, "data/sources", source.snapshotFile));
    return [source.snapshotFile, { sha256: createHash("sha256").update(raw).digest("hex"), payload: JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")) }];
  })));
  const discussion = validateDiscussions(manifest, await read("data/candidates/himeji-2025-4-discussions.json"), council.items.map((item) => item.id), files);
  return council.items.map((item) => makeTopicInput(item, council.sources, discussion.rows.find((row) => row.itemId === item.id && row.kind === "proposal")));
}

async function main() {
  const inputs = await loadInputs();
  const options = parseOptions(process.argv.slice(2), inputs.map((input) => input.itemId));
  const selected = inputs.filter((input) => options.ids.includes(input.itemId));
  if (!options.run) {
    const file = await read(candidatePath);
    validateTopicCandidates(file, inputs);
    const bytes = selected.reduce((sum, input) => sum + Buffer.byteLength(JSON.stringify(makeTopicRequest(input))), 0);
    console.log(`通信なしの事前確認：${selected.length}案件、${selected.length * 10}判定、入力合計${bytes}バイト（トークン数ではありません）。モデル：${topicPolicy.model}。保存済み候補：${file.records.length}件。`);
    console.log("実呼び出しは --run を指定。既定は135・140・154号の3件です。キー・依頼本文は出力しません。");
    return;
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey?.trim()) {
    console.error("TYPESAFE_API_KEYが未設定です。通信・候補保存は行っていません。scripts/run-topic-pilot.ps1 でキーを非表示入力できます。");
    process.exitCode = 1;
    return;
  }
  // 複数の起動による候補の上書きを防ぐ。ビルドや画面閲覧では呼ばれない。
  const lockPath = candidatePath + ".lock";
  const lock = await open(lockPath, "wx");
  const temporaryPath = `${candidatePath}.${process.pid}.tmp`;
  try {
    const existing = await read(candidatePath);
    const retained = options.refresh ? { ...existing, records: existing.records.filter((record) => !options.ids.includes(record.itemId)) } : existing;
    const records = validateTopicCandidates(retained, inputs);
    for (const input of selected) {
      if (!options.refresh && records.has(input.itemId)) { console.log(`${input.itemId}：同じ原文の保存済み候補を再利用`); continue; }
      const response = await requestTopicClassification(makeTopicRequest(input), { apiKey });
      records.set(input.itemId, makeTopicRecord(input, response, new Date().toISOString()));
      console.log(`${input.itemId}：未確認候補を生成（入力${response.usage.input_tokens}トークン）`);
    }
    const result = { schemaVersion: 1, sessionId: "himeji-2025-4", records: [...records.values()].sort((a, b) => a.itemId.localeCompare(b.itemId)) };
    validateTopicCandidates(result, inputs);
    await writeFile(temporaryPath, JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, candidatePath);
    console.log(`${result.records.length}件の未確認候補を保存しました。画面反映前に test:data と build を実行してください。`);
  } finally {
    await unlink(temporaryPath).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(safeFailureMessage(error));
  process.exitCode = 1;
});
