import { z } from "zod";

const rowSchema = z.strictObject({
  itemId: z.string().min(1),
  officialNumberRaw: z.string().min(1),
  pdfUrl: z.url(),
  pdfFile: z.string().min(1),
  page: z.number().int().positive(),
  matchLevel: z.enum(["number_and_full_title", "number_and_title_prefix"]),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  retrievedAt: z.iso.datetime({ offset: true }),
  reviewStatus: z.literal("unreviewed"),
});

export function validateBillPages(
  input: unknown,
  items: { id: string; officialNumber: { raw: string | null; value: string | null } }[],
  documents: (itemId: string) => { url: string } | null,
  hashes: Record<string, { sha256: string; pages: number }>,
) {
  const rows = z.array(rowSchema).length(51).parse(input);
  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (byId.has(row.itemId)) throw new Error(`議案本文位置が重複しています: ${row.itemId}`);
    const item = items.find((entry) => entry.id === row.itemId);
    if (!item) throw new Error(`存在しない議案の本文位置です: ${row.itemId}`);
    const officialNumber = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");
    const number = item.officialNumber.value ?? item.officialNumber.raw;
    if (!number || officialNumber(row.officialNumberRaw) !== officialNumber(number)) {
      throw new Error(`議案番号が一致しません: ${row.itemId}`);
    }
    if (documents(row.itemId)?.url !== row.pdfUrl) throw new Error(`公式議案書URLが一致しません: ${row.itemId}`);
    const source = hashes[row.pdfFile];
    if (!source || source.sha256 !== row.sourceSha256 || row.page > source.pages) {
      throw new Error(`PDFの版またはページが不正です: ${row.itemId}`);
    }
    byId.set(row.itemId, row);
  }
  if (items.filter((item) => item.id !== "member-bill-7").some((item) => !byId.has(item.id)) || byId.has("member-bill-7")) {
    throw new Error("対象議案の本文位置に欠落または余分な対応があります");
  }
  return byId;
}
