import { z } from "zod";
import { explanationStatementSchema } from "./explanation-schema.ts";

const common = {
  id: z.uuid(), targetId: z.string().min(1), candidateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  supersedes: z.uuid().nullable(), reviewer: z.string().trim().min(1).max(80),
  reviewedAt: z.iso.datetime({ offset: true }), note: z.string().trim().min(1).max(2000),
  originalTextChecked: z.literal(true), meaningChecked: z.boolean(),
};
export const contentReviewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.enum(["explanation", "child_explanation"]), decision: z.enum(["confirmed", "corrected", "withheld", "rejected"]), replacement: z.array(explanationStatementSchema).min(1).max(4).optional() }),
  z.strictObject({ ...common, kind: z.literal("discussion"), decision: z.enum(["confirmed", "withheld", "rejected"]) }),
]).superRefine((row, ctx) => {
  if (["confirmed", "corrected"].includes(row.decision) && !row.meaningChecked) ctx.addIssue({ code: "custom", message: "原文一致だけでなく、意味と対応の確認が必要です" });
  if (row.kind !== "discussion" && (row.decision === "corrected") !== Boolean(row.replacement)) ctx.addIssue({ code: "custom", message: "訂正文は訂正を選択したときだけ入力してください" });
});
export type ContentReview = z.infer<typeof contentReviewSchema>;
export const contentReviewFileSchema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal("content_reviews"), sessionId: z.literal("himeji-2025-4"),
  records: z.array(contentReviewSchema).max(10000),
});
export const contentReviewKey = (row: Pick<ContentReview, "kind" | "targetId">) => `${row.kind}:${row.targetId}`;
export const contentDecisionLabel = { confirmed: "人による確認記録あり", corrected: "人による訂正・確認記録あり", withheld: "人の判断で保留", rejected: "修正が必要なため表示を停止" } as const;
