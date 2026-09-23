import type { CouncilData } from "./schema";

const expected = { items: 52, members: 45, factions: 11, memberships: 45, votes: 2340 } as const;

// 型・参照検証を通った候補でも、画面に必要な件数・人の確認状態を別途検査する。
export function assertCandidateReadyForDisplay(data: CouncilData, council: CouncilData) {
  for (const [key, count] of Object.entries(expected) as [keyof typeof expected, number][]) {
    if (data[key].length !== count) throw new Error(`PDF候補の${key}件数が想定と異なります`);
  }
  if (JSON.stringify(data.items) !== JSON.stringify(council.items)) {
    throw new Error("PDF候補に含まれる議案と画面用の議案が一致しません");
  }
  const source = data.sources.find((row) => row.id === "himeji-32187-votes-pdf");
  if (!source) throw new Error("PDF候補の公式出典がありません");
  for (const collection of [data.members, data.factions, data.memberships, data.votes]) {
    if (collection.some((row) => row.reviewStatus !== "unreviewed" || row.sourceIds.length !== 1 || row.sourceIds[0] !== source.id)) {
      throw new Error("PDF候補に未確認以外の行、または公式PDF以外の出典があります");
    }
  }
  if (source.reviewStatus !== "unreviewed") throw new Error("PDF出典が人による確認済みになっています");
  const perItem = new Map<string, number>();
  for (const vote of data.votes) perItem.set(vote.itemId, (perItem.get(vote.itemId) ?? 0) + 1);
  if (data.items.some((item) => perItem.get(item.id) !== data.members.length)) {
    throw new Error("案件ごとの議員別賛否候補が45件揃っていません");
  }
  return source;
}
