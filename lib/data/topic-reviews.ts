import { createHash } from "node:crypto";
import { z } from "zod";
import { topicDefinitions, topicView } from "./topic-classification.ts";
import type { TopicRecord } from "./topic-classification.ts";

const topicId = z.enum(topicDefinitions.map((topic) => topic.id));
export const topicReviewSchema = z.strictObject({
  id: z.uuid(), itemId: z.string().min(1),
  candidateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  supersedes: z.uuid().nullable(),
  reviewer: z.string().trim().min(1).max(80),
  reviewedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["confirmed", "corrected", "withheld"]),
  topicIds: z.array(topicId).max(topicDefinitions.length),
  note: z.string().trim().min(1).max(2000),
  comparedWithOfficialSource: z.literal(true),
}).superRefine((row, ctx) => {
  if (new Set(row.topicIds).size !== row.topicIds.length) ctx.addIssue({ code: "custom", message: "分野が重複しています" });
  if ((row.decision === "withheld") !== (row.topicIds.length === 0)) ctx.addIssue({ code: "custom", message: "保留時は分野を空にし、確認・修正時は分野を選択してください" });
});
export type TopicReview = z.infer<typeof topicReviewSchema>;
export const topicReviewFileSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: z.literal("himeji-2025-4"),
  records: z.array(topicReviewSchema).max(10000),
});
export const topicCandidateDigest = (record: TopicRecord) => createHash("sha256").update(JSON.stringify(record)).digest("hex");
const sameIds = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// 元候補・原文・票の確認状態は変更しない。古い版の記録も履歴として保持する。
export function validateTopicReviews(input: unknown, candidates: Map<string, TopicRecord>, now = Date.now()) {
  const file = topicReviewFileSchema.parse(input);
  const ids = new Set<string>();
  const latest = new Map<string, TopicReview>();
  for (const row of file.records) {
    const candidate = candidates.get(row.itemId);
    if (!candidate) throw new Error("分類確認の議案参照が不正です");
    if (ids.has(row.id)) throw new Error("分類確認IDが重複しています");
    const previous = latest.get(row.itemId);
    if (row.supersedes !== (previous?.id ?? null)) throw new Error("確認履歴が競合しています。最新画面から記録し直してください");
    const at = Date.parse(row.reviewedAt);
    if (at > now + 300000 || (previous && at < Date.parse(previous.reviewedAt))) throw new Error("確認日時が不正です");
    if (row.candidateSha256 === topicCandidateDigest(candidate)) {
      if (at < Date.parse(candidate.generatedAt)) throw new Error("候補生成前の確認日時です");
      const matches = sameIds(row.topicIds, topicView(candidate).topics.map((topic) => topic.id));
      if ((row.decision === "confirmed" && !matches) || (row.decision === "corrected" && matches)) throw new Error("確認・修正の区分と分野が一致しません");
    }
    ids.add(row.id); latest.set(row.itemId, row);
  }
  const active = new Map([...latest].filter(([id, row]) => row.candidateSha256 === topicCandidateDigest(candidates.get(id)!)));
  const stale = new Map([...latest].filter(([id]) => !active.has(id)));
  return { file, latest, active, stale };
}

export function appendTopicReviews(existing: unknown, incoming: unknown, candidates: Map<string, TopicRecord>, now = Date.now()) {
  const current = validateTopicReviews(existing, candidates, now);
  const addition = topicReviewFileSchema.parse(incoming);
  if (!addition.records.length) throw new Error("取り込む確認記録がありません");
  for (const row of addition.records) {
    const candidate = candidates.get(row.itemId);
    if (!candidate || row.candidateSha256 !== topicCandidateDigest(candidate)) throw new Error("原文または分類候補が更新されています。最新画面から照合し直してください");
  }
  return validateTopicReviews({ ...current.file, records: [...current.file.records, ...addition.records] }, candidates, now).file;
}

export function reviewedTopicView(candidate?: TopicRecord, review?: TopicReview) {
  if (!review) return { ...topicView(candidate), review: undefined };
  const topics = topicDefinitions.filter((topic) => review.topicIds.includes(topic.id)).map(({ id, label }) => ({ id, label }));
  return { state: topics.length ? "candidate" as const : "withheld" as const, topics, review };
}
