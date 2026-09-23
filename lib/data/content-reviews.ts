import { createHash } from "node:crypto";
import { contentReviewFileSchema, contentReviewKey } from "./content-review-schema.ts";
import type { ContentReview } from "./content-review-schema.ts";
import { explanationEvidence } from "./explanation-validation.ts";
import type { ExplanationRecord } from "./explanation-validation.ts";
import type { DiscussionView } from "./discussion-validation.ts";

export type ContentTargets = { explanations: Map<string, ExplanationRecord>; childExplanations?: Map<string, ExplanationRecord>; discussions: Map<string, DiscussionView> };
export const contentDigest = (candidate: ExplanationRecord | DiscussionView) => createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
function candidateFor(row: ContentReview, targets: ContentTargets) { return row.kind === "discussion" ? targets.discussions.get(row.targetId) : row.kind === "child_explanation" ? targets.childExplanations?.get(row.targetId) : targets.explanations.get(row.targetId); }

export function validateContentReviews(value: unknown, targets: ContentTargets, now = Date.now()) {
  const file = contentReviewFileSchema.parse(value);
  const latest = new Map<string, ContentReview>(), ids = new Set<string>();
  for (const row of file.records) {
    const key = contentReviewKey(row), candidate = candidateFor(row, targets), previous = latest.get(key);
    if (!candidate) throw new Error("確認対象が存在しません");
    if (ids.has(row.id)) throw new Error("確認IDが重複しています");
    if (row.supersedes !== (previous?.id ?? null)) throw new Error("確認履歴が競合しています。最新画面を読み直してください");
    const time = Date.parse(row.reviewedAt);
    if (time > now + 300000 || (previous && time < Date.parse(previous.reviewedAt))) throw new Error("確認日時が不正です");
    if (row.candidateSha256 === contentDigest(candidate)) {
      const earliest = "createdAt" in candidate ? candidate.createdAt : candidate.source.retrievedAt;
      if (time < Date.parse(earliest)) throw new Error("対象の作成・取得より前の確認日時です");
      if (row.kind !== "discussion" && row.decision === "corrected") {
        const explanation = candidate as ExplanationRecord;
        if (JSON.stringify(explanation.statements) === JSON.stringify(row.replacement)) throw new Error("訂正内容が元の説明と同じです");
        for (const statement of row.replacement!) for (const source of statement.evidenceIds) {
          if (!explanationEvidence(explanation.input, source)) throw new Error("訂正文の根拠が取得されていません");
        }
      }
    }
    ids.add(row.id); latest.set(key, row);
  }
  const active = new Map([...latest].filter(([, row]) => row.candidateSha256 === contentDigest(candidateFor(row, targets)!)));
  const stale = new Map([...latest].filter(([key]) => !active.has(key)));
  return { file, latest, active, stale };
}

export function appendContentReviews(existing: unknown, incoming: unknown, targets: ContentTargets, now = Date.now()) {
  const current = validateContentReviews(existing, targets, now);
  const addition = contentReviewFileSchema.parse(incoming);
  if (!addition.records.length) throw new Error("取り込む確認記録がありません");
  for (const row of addition.records) {
    const candidate = candidateFor(row, targets);
    if (!candidate || row.candidateSha256 !== contentDigest(candidate)) throw new Error("確認対象が更新されています。再照合してください");
  }
  return validateContentReviews({ ...current.file, records: [...current.file.records, ...addition.records] }, targets, now).file;
}

export function discussionNeedsCorrection(id: string, active: Map<string, ContentReview>) {
  const decision = active.get(`discussion:${id}`)?.decision;
  return decision === "rejected" || decision === "withheld";
}

export function explanationDisplay(candidate: ExplanationRecord, active: Map<string, ContentReview>, kind: "explanation" | "child_explanation" = "explanation") {
  const review = active.get(`${kind}:${candidate.itemId}`);
  const statements = review && review.kind !== "discussion" && review.decision === "corrected" ? review.replacement! : candidate.statements;
  const sourceIssue = Boolean(candidate.input.proposal && statements.some((statement) => statement.evidenceIds.includes("proposal")) && discussionNeedsCorrection(candidate.input.proposal.associationId, active));
  const hidden = sourceIssue || review?.decision === "withheld" || review?.decision === "rejected";
  return { review, sourceIssue, hidden, statements: hidden ? [] : statements };
}
