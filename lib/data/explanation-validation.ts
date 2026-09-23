import { createHash } from "node:crypto";
import { z } from "zod";
import { topicInputSchema } from "./topic-classification.ts";
import type { TopicInput } from "./topic-classification.ts";

// 分類と同じ原文・出典構造を再利用する。分類結果・APIへの依存はない。
import { explanationEvidenceId, explanationStatementSchema as statementSchema } from "./explanation-schema.ts";
export { explanationEvidenceId } from "./explanation-schema.ts";
export const explanationDraftSchema = z.strictObject({
  itemId: z.string().min(1), statements: z.array(statementSchema).min(1).max(4),
  reviewHints: z.array(z.string().trim().min(1).max(300)).max(4),
});
export const explanationDraftsSchema = z.array(explanationDraftSchema).min(1).max(52);
const recordSchema = explanationDraftSchema.extend({
  input: topicInputSchema, inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime({ offset: true }),
  authoring: z.literal("assistant_draft"), reviewStatus: z.literal("unreviewed"),
});
export type ExplanationRecord = z.infer<typeof recordSchema>;
export type ExplanationEvidenceId = z.infer<typeof explanationEvidenceId>;
export const explanationFileSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: z.literal("himeji-2025-4"), records: z.array(recordSchema).min(1).max(52),
});
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function explanationEvidence(input: TopicInput, id: ExplanationEvidenceId) {
  if (id === "proposal") return input.proposal ? { label: "会議録の提案説明（対応の確認状態は議論欄を参照）", ...input.proposal } : undefined;
  const field = input.fields.find((row) => row.field === id);
  return field?.state === "known" && field.raw ? { label: id === "title" ? "公式の正式名称" : "公式概要", ...field, raw: field.raw } : undefined;
}

export function createExplanationCandidates(drafts: unknown, inputs: TopicInput[], createdAt: string) {
  const parsed = explanationDraftsSchema.parse(drafts);
  const records = parsed.map((draft) => {
    const input = inputs.find((row) => row.itemId === draft.itemId);
    if (!input) throw new Error("説明案の議案参照が不正です");
    return { ...draft, input, inputSha256: digest(input), createdAt, authoring: "assistant_draft" as const, reviewStatus: "unreviewed" as const };
  });
  const file = { schemaVersion: 1 as const, sessionId: "himeji-2025-4" as const, records };
  validateExplanations(file, inputs, parsed);
  return file;
}

export function refreshExplanationCandidates(drafts: unknown, inputs: TopicInput[], createdAt: string, previous?: unknown) {
  const file = createExplanationCandidates(drafts, inputs, createdAt);
  const old = previous ? explanationFileSchema.parse(previous).records : [];
  file.records = file.records.map(record => {
    const earlier = old.find(row => row.itemId === record.itemId);
    // 文・根拠・取得日時が同じなら作成日時も保持し、他の行の確認を失効させない。
    return earlier && digest({ ...earlier, createdAt }) === digest(record) ? earlier : record;
  });
  validateExplanations(file, inputs, drafts);
  return file;
}

export function validateExplanations(value: unknown, inputs: TopicInput[], drafts: unknown) {
  const file = explanationFileSchema.parse(value);
  const editorial = explanationDraftsSchema.parse(drafts);
  const expected = new Map(inputs.map((row) => [row.itemId, row]));
  const draftById = new Map(editorial.map((row) => [row.itemId, row]));
  if (expected.size !== inputs.length || draftById.size !== editorial.length) throw new Error("説明の入力IDが重複しています");
  if (file.records.length !== expected.size || editorial.length !== expected.size) throw new Error("説明案の件数が対象議案と一致しません");
  const byId = new Map<string, ExplanationRecord>();
  for (const record of file.records) {
    const current = expected.get(record.itemId), draft = draftById.get(record.itemId);
    if (!current || !draft || record.input.itemId !== record.itemId || byId.has(record.itemId)) throw new Error("説明案の議案参照が不正または重複しています");
    if (digest(current) !== record.inputSha256 || digest(record.input) !== record.inputSha256) throw new Error("説明の根拠となる原文・出典が更新されています。内容の再確認が必要です");
    if (digest({ itemId: record.itemId, statements: record.statements, reviewHints: record.reviewHints }) !== digest(draft)) throw new Error("説明案が更新されています。根拠を再確認して保存し直してください");
    for (const statement of record.statements) for (const id of statement.evidenceIds) {
      if (!explanationEvidence(record.input, id)) throw new Error("説明文が未取得・記載なしの資料を根拠にしています");
    }
    byId.set(record.itemId, record);
  }
  return byId;
}

// 優先度は確認作業の順序だけに使用し、正しさの判定や承認には使わない。
export function explanationReviewReasons(record: ExplanationRecord) {
  return [
    ...record.reviewHints,
    ...(record.statements.some((row) => row.evidenceIds.includes("proposal")) ? ["会議録の提案説明を根拠にしています。説明と議案の対応も見比べてください。"] : []),
    ...(record.statements.every((row) => row.evidenceIds.every((id) => id === "title")) ? ["取得済みの根拠は正式名称のみです。変更内容の詳細は未確認です。"] : []),
  ];
}
