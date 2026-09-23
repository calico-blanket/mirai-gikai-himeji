// 姫路市「令和7年市議会提出議案」に明記されたPDFの議案番号範囲。
// ページ位置や議案本文の内容は、ここでは推測しない。
const documentGroups = [
  { from: 135, to: 136, label: "補正予算（議案第135号・第136号）", url: "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30105/R7-4_hoseiyosan_gian135-136.pdf" },
  { from: 137, to: 163, label: "議案第137号〜第163号", url: "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30105/R7-4_gian137-163_hokoku25-28.pdf" },
  { from: 164, to: 166, label: "補正予算（議案第164号〜第166号）", url: "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30105/R7-4_hoseiyosan_gian164-166.pdf" },
  { from: 167, to: 173, label: "議案第167号〜第173号・諮問第1号〜第12号", url: "https://www.city.himeji.lg.jp/shisei/cmsfiles/contents/0000030/30105/R7-4_gian167-173_shimon1-12.pdf" },
] as const;

export function billDocumentForId(id: string) {
  const bill = /^bill-(\d+)$/.exec(id);
  if (bill) {
    const number = Number(bill[1]);
    return documentGroups.find((group) => group.from <= number && number <= group.to) ?? null;
  }
  const inquiry = /^inquiry-(\d+)$/.exec(id);
  if (inquiry && Number(inquiry[1]) >= 1 && Number(inquiry[1]) <= 12) return documentGroups[3];
  return null;
}
