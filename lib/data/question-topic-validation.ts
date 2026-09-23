import { z } from "zod";

const rowSchema = z.strictObject({
  itemId: z.string().min(1),
  speakerRaw: z.string().min(1),
  topicRaw: z.string().min(1),
  sourceUrl: z.literal("https://himeji.gijiroku.com/g07_Shitsumon.asp?kaigi=122&Sflg=2"),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  retrievedAt: z.iso.datetime({ offset: true }),
  reviewStatus: z.literal("unreviewed"),
});

export function validateQuestionTopics(input: unknown, itemIds: string[], sourceSha256: string) {
  const rows = z.array(rowSchema).parse(input);
  const byId = new Map<string, (typeof rows)[number][]>();
  const unique = new Set<string>();
  for (const row of rows) {
    if (!itemIds.includes(row.itemId)) throw new Error(`存在しない議案の質問項目です: ${row.itemId}`);
    const number = /^bill-(\d+)$/.exec(row.itemId)?.[1];
    if (!number || !new RegExp(`議案第\\s*${number}号`).test(row.topicRaw)) {
      throw new Error(`質問項目に議案番号の明記がありません: ${row.itemId}`);
    }
    if (row.sourceSha256 !== sourceSha256) throw new Error(`公式質問一覧の版が異なります: ${row.itemId}`);
    const key = `${row.itemId}:${row.speakerRaw}:${row.topicRaw}`;
    if (unique.has(key)) throw new Error(`質問項目が重複しています: ${row.itemId}`);
    unique.add(key);
    byId.set(row.itemId, [...(byId.get(row.itemId) ?? []), row]);
  }
  return byId;
}
