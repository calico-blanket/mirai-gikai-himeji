// topic-classification.ts の TopicInput から fields[].reviewStatus を除いた設計変更に伴い、
// 保存済みの分類・説明候補JSONの input.fields からも同じキーを削除し、inputSha256 を再計算する。
// 中身（原文・出典・確認状態そのものではない項目）は変更しない。応答・回答・確認記録も変更しない。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { makeTopicRequest } from "../lib/data/topic-classification.ts";

const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const targets = [
  { path: "data/candidates/himeji-2025-4-explanations.json", hasRequestSha: false },
  { path: "data/candidates/himeji-2025-4-child-explanations.json", hasRequestSha: false },
  { path: "data/candidates/himeji-2025-4-topics.json", hasRequestSha: true },
];

for (const { path, hasRequestSha } of targets) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  let changed = 0;
  for (const record of file.records) {
    if (!("reviewStatus" in record.input.fields[0])) continue;
    record.input = {
      ...record.input,
      fields: record.input.fields.map(({ reviewStatus, ...rest }) => rest),
    };
    record.inputSha256 = sha(record.input);
    if (hasRequestSha) record.requestSha256 = sha(makeTopicRequest(record.input));
    changed += 1;
  }
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`${path}: ${changed}件のinputを更新しました`);
}
