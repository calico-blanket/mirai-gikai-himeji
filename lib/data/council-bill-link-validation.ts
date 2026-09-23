import { z } from "zod";

const rowSchema = z.strictObject({
  itemId: z.string().min(1),
  detailUrl: z.url(),
  headingRaw: z.string().min(1),
  resultLineRaw: z.string().min(1),
  sourceUrl: z.literal("https://himeji.gijiroku.com/g07_giketsu_s.asp?kaigi=122&sflg=2"),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  retrievedAt: z.iso.datetime({ offset: true }),
  reviewStatus: z.literal("unreviewed"),
});

export function validateCouncilBillLinks(input: unknown, items: { id: string; title: { raw: string | null } }[], sourceSha256: string) {
  const rows = z.array(rowSchema).length(52).parse(input);
  const byId = new Map<string, (typeof rows)[number]>();
  const urls = new Set<string>();
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").replace(/−/g, "-");
  for (const row of rows) {
    if (byId.has(row.itemId)) throw new Error(`市議会詳細リンクの議案IDが重複しています: ${row.itemId}`);
    const item = items.find((entry) => entry.id === row.itemId);
    if (!item?.title.raw || !normalize(row.headingRaw).includes(normalize(item.title.raw))) {
      throw new Error(`市議会の件名が保存済み議案と一致しません: ${row.itemId}`);
    }
    const url = new URL(row.detailUrl);
    if (url.hostname !== "himeji.gijiroku.com" || url.pathname !== "/g07_giketsu_s.asp" || url.searchParams.get("sflg") !== "3" || url.searchParams.get("kaigi") !== "122" || !/^\d+$/.test(url.searchParams.get("SrchID") ?? "")) {
      throw new Error(`市議会詳細リンクの形式が不正です: ${row.itemId}`);
    }
    if (urls.has(row.detailUrl)) throw new Error(`市議会詳細リンクが重複しています: ${row.itemId}`);
    if (row.sourceSha256 !== sourceSha256) throw new Error(`市議会一覧の版が異なります: ${row.itemId}`);
    urls.add(row.detailUrl);
    byId.set(row.itemId, row);
  }
  if (items.some((item) => !byId.has(item.id))) throw new Error("市議会詳細リンクに欠落があります");
  return byId;
}
