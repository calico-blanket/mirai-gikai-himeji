import { createHash } from "node:crypto";
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["votes", "headers"]),
  sourceUrl: z.url(),
  pdfSha256: sha256,
  page: z.number().int().min(1).max(4),
  rowStart: z.number().int().min(1).max(16).optional(),
  rowEnd: z.number().int().min(1).max(16).optional(),
  columnStart: z.number().int().min(1).max(45),
  columnEnd: z.number().int().min(1).max(45),
  candidateSha256: sha256,
  reviewer: z.string().trim().min(1),
  checkedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["verified", "needs_correction"]),
  note: z.string().trim().min(1).optional(),
}).superRefine((record, ctx) => {
  if (record.decision === "needs_correction" && !record.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "相違の内容を記録してください" });
  }
});

export type HumanReview = z.infer<typeof recordSchema>;
type Position = { itemId: string; page: number; row: number };
type Candidate = {
  members: { id: string; name: { raw: string | null; value: string | null } }[];
  factions: { id: string; name: { raw: string | null; value: string | null } }[];
  memberships: { memberId: string; factionId: { raw: string | null; value: string | null } }[];
  votes: { id: string; itemId: string; memberId: string; position: { state: string; raw: string | null; value: string | null } }[];
};
type Range = Pick<HumanReview, "kind" | "page" | "rowStart" | "rowEnd" | "columnStart" | "columnEnd">;
const pageRows = [15, 16, 16, 5];

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function column(memberId: string) {
  const match = /^pdf-col-(\d{2})$/.exec(memberId);
  return match ? Number(match[1]) : NaN;
}

export function candidateDigest(range: Range, data: Candidate, positions: Position[]) {
  if (range.kind === "headers") {
    if (range.page !== 1 || range.rowStart !== undefined || range.rowEnd !== undefined) throw new Error("見出し確認は1ページ目の列だけを指定します");
    const members = data.members.filter((member) => column(member.id) >= range.columnStart && column(member.id) <= range.columnEnd);
    if (members.length !== range.columnEnd - range.columnStart + 1) throw new Error("見出しの列が不足しています");
    return digest(members.map((member) => {
      const membership = data.memberships.find((row) => row.memberId === member.id);
      const faction = data.factions.find((row) => row.id === membership?.factionId.value);
      if (!membership || !faction) throw new Error(`会派の参照がありません: ${member.id}`);
      return [member.id, member.name, membership.factionId, faction.name];
    }));
  }
  if (range.rowStart === undefined || range.rowEnd === undefined || range.rowStart > range.rowEnd || range.rowEnd > pageRows[range.page - 1]) {
    throw new Error("PDFの行範囲が不正です");
  }
  const rows = positions.filter((p) => p.page === range.page && p.row >= range.rowStart! && p.row <= range.rowEnd!).sort((a, b) => a.row - b.row);
  if (rows.length !== range.rowEnd - range.rowStart + 1) throw new Error("PDFの行が不足しています");
  const byCell = new Map(data.votes.map((vote) => [`${vote.itemId}:${column(vote.memberId)}`, vote]));
  const cells = rows.flatMap((row) => Array.from({ length: range.columnEnd - range.columnStart + 1 }, (_, i) => {
    const vote = byCell.get(`${row.itemId}:${range.columnStart + i}`);
    if (!vote) throw new Error(`票の候補がありません: ${row.itemId}・${range.columnStart + i}列`);
    return [row.itemId, row.row, range.columnStart + i, vote.id, vote.memberId, vote.position];
  }));
  return digest(cells);
}

export function validateHumanReviews(input: unknown, data: Candidate, positions: Position[], pdfSha256: string, sourceUrl: string) {
  const records = z.array(recordSchema).parse(input);
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`確認記録IDが重複しています: ${record.id}`);
    ids.add(record.id);
    if (record.sourceUrl !== sourceUrl || record.pdfSha256 !== pdfSha256) throw new Error(`原PDFの版またはURLが異なります: ${record.id}`);
    if (record.columnStart > record.columnEnd) throw new Error(`列範囲が不正です: ${record.id}`);
    if (record.candidateSha256 !== candidateDigest(record, data, positions)) throw new Error(`候補データが確認時から変わっています: ${record.id}`);
    const first = record.kind === "headers" ? 0 : record.rowStart!;
    const last = record.kind === "headers" ? 0 : record.rowEnd!;
    for (let row = first; row <= last; row++) for (let col = record.columnStart; col <= record.columnEnd; col++) {
      const key = `${record.kind}:${record.page}:${row}:${col}`;
      if (cells.has(key)) throw new Error(`確認範囲が重複しています: ${record.id}`);
      cells.add(key);
    }
  }
  return records;
}

export function voteIdsForDecision(records: HumanReview[], data: Candidate, positions: Position[], decision: HumanReview["decision"]) {
  const matched = new Set<string>();
  const byItem = new Map(positions.map((p) => [p.itemId, p]));
  for (const vote of data.votes) {
    const p = byItem.get(vote.itemId);
    if (p && records.some((r) => r.kind === "votes" && r.decision === decision && r.page === p.page && p.row >= r.rowStart! && p.row <= r.rowEnd! && column(vote.memberId) >= r.columnStart && column(vote.memberId) <= r.columnEnd)) matched.add(vote.id);
  }
  return matched;
}

export function reviewedVoteIds(records: HumanReview[], data: Candidate, positions: Position[]) {
  return voteIdsForDecision(records, data, positions, "verified");
}
