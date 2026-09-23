import { readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputs } from "./classify-himeji-topics.mjs";
import { refreshExplanationCandidates, validateExplanations } from "../lib/data/explanation-validation.ts";
import { childExplanationDrafts } from "../lib/data/child-explanations.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (new Set(args).size !== args.length || args.some((arg) => !["--write", "--child"].includes(arg))) throw new Error("保存は --write、小学生向けは --child を指定してください");
const adults = JSON.parse(await readFile(resolve(root, "data/editorial/himeji-2025-4-explanation-drafts.json"), "utf8"));
const drafts = args.includes("--child") ? childExplanationDrafts(JSON.parse(await readFile(resolve(root, "data/editorial/himeji-2025-4-child-explanation-texts.json"), "utf8")), adults) : adults;
const inputs = await loadInputs();
const destination = resolve(root, `data/candidates/himeji-2025-4-${args.includes("--child") ? "child-" : ""}explanations.json`);
let previous;
try { previous = JSON.parse(await readFile(destination, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const file = refreshExplanationCandidates(drafts, inputs, new Date().toISOString(), previous);
if (!args.includes("--write")) {
  console.log(`通信なしの事前検証：${file.records.length}件の説明案。保存はしていません。文章の意味の正しさは人による確認が必要です。`);
} else {
  const lock = await open(destination + ".lock", "wx");
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    validateExplanations(file, inputs, drafts);
    await writeFile(temporary, JSON.stringify(file, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, destination);
    console.log(`${file.records.length}件の未確認説明案と根拠を保存しました。APIは呼び出していません。`);
  } finally {
    await unlink(temporary).catch(() => {}); await lock.close(); await unlink(destination + ".lock");
  }
}
