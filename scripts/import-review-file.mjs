import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contentReviewFileSchema } from "../lib/data/content-review-schema.ts";
import { topicReviewFileSchema } from "../lib/data/topic-reviews.ts";
import { importContentReviews } from "./import-content-reviews.mjs";
import { importTopicReviews } from "./import-topic-reviews.mjs";
import { loadContentTargets } from "./load-content-targets.mjs";
import { loadInputs } from "./classify-himeji-topics.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function reviewFileKind(value) {
  if (contentReviewFileSchema.safeParse(value).success) return "content";
  if (topicReviewFileSchema.safeParse(value).success) return "topic";
  throw new Error("対応する確認記録ではありません");
}
async function main() {
  const args=process.argv.slice(2), apply=args.includes("--apply"), paths=args.filter(arg=>arg!=="--apply");
  if (paths.length!==1 || paths[0].startsWith("--") || args.length!==1+Number(apply)) throw new Error("ファイル指定が不正です");
  const incomingPath=resolve(paths[0]);
  const kind=reviewFileKind(JSON.parse((await readFile(incomingPath,"utf8")).replace(/^\uFEFF/,"")));
  const result=kind==="content" ? await importContentReviews({incomingPath,apply,targets:await loadContentTargets(),ledgerPath:resolve(root,"data/candidates/himeji-2025-4-content-reviews.json")}) : await importTopicReviews({incomingPath,apply,inputs:await loadInputs(),ledgerPath:resolve(root,"data/candidates/himeji-2025-4-topic-reviews.json"),candidatePath:resolve(root,"data/candidates/himeji-2025-4-topics.json")});
  console.log(`${kind==="content"?"説明・議論":"分野分類"}の確認記録：${apply?"保存しました":"検証しました（保存なし）"}。履歴${result.records.length}件。`);
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{
  console.error("取り込めませんでした。画面から保存した確認記録か、既に取り込み済みでないか、対象が更新されていないかを確認してください。"); process.exitCode=1;
});
