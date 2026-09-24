import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
type Source = { file: string; url: string; sha256: string; pages: number };
type Row = { itemId: string; file: string; page: number };
type Candidate = { sessionId: string; method: string; reviewStatus: string; retrievedAt: string; sources: Source[]; rows: Row[] };
const candidate = JSON.parse(readFileSync("data/candidates/himeji-2025-4-committee-pages.json", "utf8")) as Candidate;
const councilData = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")) as { items: { id: string }[] };

const base = "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30346/";
const ids = new Set(councilData.items.map((item) => item.id));
const seen = new Set<string>();
if (candidate.sessionId !== "himeji-2025-4" || candidate.method !== "explicit_number_on_pdf_page" || candidate.reviewStatus !== "unreviewed") {
  throw new Error("委員会PDF候補の会期・抽出方法・確認状態が不正です");
}
const sources = new Map(candidate.sources.map((source) => {
  if (!/^[A-Za-z0-9]+\.pdf$/.test(source.file) || source.url !== `${base}${source.file}` || !Number.isInteger(source.pages) || source.pages < 1) {
    throw new Error("委員会PDF出典が不正です");
  }
  const pdf = readFileSync(`data/sources/committee-pdfs/${source.file}`);
  if (createHash("sha256").update(pdf).digest("hex") !== source.sha256) throw new Error("委員会PDFの版が候補と一致しません");
  return [source.file, source] as const;
}));
if (sources.size !== candidate.sources.length) throw new Error("委員会PDF出典の重複");
for (const row of candidate.rows) {
  const source = sources.get(row.file);
  const key = `${row.itemId}:${row.file}:${row.page}`;
  if (!ids.has(row.itemId) || !source || !Number.isInteger(row.page) || row.page < 1 || row.page > source.pages || seen.has(key)) {
    throw new Error("委員会PDFの議案・ページ参照が不正です");
  }
  seen.add(key);
}

export const committeePageCount = candidate.rows.length;
export const committeeBillCount = new Set(candidate.rows.map((row) => row.itemId)).size;
export function committeePagesForId(itemId: string) {
  return candidate.rows.filter((row) => row.itemId === itemId).map((row) => ({
    url: `${base}${row.file}#page=${row.page}`,
    page: row.page,
    file: row.file,
    retrievedAt: candidate.retrievedAt,
  }));
}
