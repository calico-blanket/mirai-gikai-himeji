import { z } from "zod";

export const explanationEvidenceId = z.enum(["title", "officialSummary", "proposal"]);
export const explanationStatementSchema = z.strictObject({
  text: z.string().trim().min(1).max(400),
  evidenceIds: z.array(explanationEvidenceId).min(1).max(3),
}).refine((row) => new Set(row.evidenceIds).size === row.evidenceIds.length, "根拠参照が重複しています");
