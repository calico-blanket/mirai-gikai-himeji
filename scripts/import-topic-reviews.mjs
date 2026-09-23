import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputs } from "./classify-himeji-topics.mjs";
import { validateTopicCandidates } from "../lib/data/topic-classification.ts";
import { appendTopicReviews } from "../lib/data/topic-reviews.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (path) => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));

// dry-runを既定とし、検証済みの追記だけを一時ファイルから置き換える。
export async function importTopicReviews({ ledgerPath, candidatePath, incomingPath, inputs, apply = false }) {
  const lock = await open(ledgerPath + ".lock", "wx");
  const temporary = `${ledgerPath}.${process.pid}.tmp`;
  try {
    const previous = await readFile(ledgerPath, "utf8");
    const candidateRaw = await readFile(candidatePath, "utf8");
    const candidates = validateTopicCandidates(JSON.parse(candidateRaw), inputs);
    const file = appendTopicReviews(JSON.parse(previous), await read(incomingPath), candidates);
    if (apply) {
      if (candidateRaw !== await readFile(candidatePath, "utf8")) throw new Error("分類生成が進行中です。終了後にやり直してください");
      await writeFile(`${ledgerPath}.${Date.now()}-${process.pid}.backup`, previous, { flag: "wx" });
      await writeFile(temporary, JSON.stringify(file, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      await rename(temporary, ledgerPath);
    }
    return file;
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(ledgerPath + ".lock");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const paths = args.filter((arg) => arg !== "--apply");
  if (paths.length !== 1 || paths[0].startsWith("--") || args.length !== paths.length + Number(apply)) throw new Error("確認記録JSONのパスを1つ指定してください。保存する場合だけ --apply を付けます");
  const file = await importTopicReviews({
    ledgerPath: resolve(root, "data/candidates/himeji-2025-4-topic-reviews.json"),
    candidatePath: resolve(root, "data/candidates/himeji-2025-4-topics.json"),
    incomingPath: resolve(paths[0]), inputs: await loadInputs(), apply,
  });
  console.log(apply ? `分類確認を追記しました。履歴${file.records.length}件。test:data・typecheck・build後にサーバーを再起動してください。` : `検証に通りました。保存はしていません。--apply を付けると分類確認の台帳に追記します。`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  // JSON本文・確認者の入力をエラーに展開しない。
  console.error("確認記録を取り込めませんでした。ファイル指定、必須項目、最新の候補・履歴との対応、確認日時を確認してください。既存台帳は変更していません。");
  process.exitCode = 1;
});
