import { readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendContentReviews } from "../lib/data/content-reviews.ts";
import { loadContentTargets } from "./load-content-targets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (path) => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
export async function importContentReviews({ incomingPath, ledgerPath, targets, apply = false }) {
  const lock = await open(ledgerPath + ".lock", "wx"), temporary = `${ledgerPath}.${process.pid}.tmp`;
  try {
    const previous = await readFile(ledgerPath, "utf8");
    const result = appendContentReviews(JSON.parse(previous), await read(incomingPath), targets);
    if (apply) {
      // 反映前の履歴を一意なファイルへ保存する。既存の履歴を上書きしない。
      await writeFile(`${ledgerPath}.${Date.now()}-${process.pid}.backup`, previous, { flag: "wx" });
      await writeFile(temporary, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, ledgerPath);
    }
    return result;
  } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(ledgerPath + ".lock"); }
}
async function main() {
  const args = process.argv.slice(2), apply = args.includes("--apply"), paths = args.filter((arg) => arg !== "--apply");
  if (paths.length !== 1 || paths[0].startsWith("--") || args.length !== 1 + Number(apply)) throw new Error("ファイル指定が不正です");
  const result = await importContentReviews({ incomingPath: resolve(paths[0]), ledgerPath: resolve(root, "data/candidates/himeji-2025-4-content-reviews.json"), targets: await loadContentTargets(), apply });
  console.log(apply ? `説明・議論の確認記録を保存しました。履歴${result.records.length}件。` : "検証に通りました。まだ保存していません。");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error("取り込めませんでした。記録の重複、対象の更新、原文・意味の確認欄、訂正の根拠を確認してください。最新の画面から記録し直せます。"); process.exitCode = 1;
});
