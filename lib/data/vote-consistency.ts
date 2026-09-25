import type { CouncilData } from "./schema";

// 議決結果とPDF賛否候補の賛成・反対数だけを突き合わせる機械チェック。
// 一致しない場合だけを「先に見る優先度が高い」と示す。一致していても、
// 議員別の賛否候補そのものを確認済みとは扱わない。多数決以外の議決要件
// （特別多数など）は判定せず、賛成・反対の単純な大小関係だけを見る。
export type VoteConsistencyCheck = {
  itemId: string;
  result: "passed" | "rejected" | "consented" | "other";
  forCount: number;
  againstCount: number;
  consistent: boolean;
  note: string;
};

function expectedOutcome(result: VoteConsistencyCheck["result"], forCount: number, againstCount: number) {
  if (result === "passed" || result === "consented") return forCount > againstCount;
  if (result === "rejected") return forCount <= againstCount;
  return true;
}

export function checkVoteConsistency(items: CouncilData["items"], votes: CouncilData["votes"]): VoteConsistencyCheck[] {
  const byItem = new Map<string, CouncilData["votes"]>();
  for (const vote of votes) {
    const list = byItem.get(vote.itemId) ?? [];
    list.push(vote);
    byItem.set(vote.itemId, list);
  }
  return items.map((item) => {
    const itemVotes = byItem.get(item.id) ?? [];
    const forCount = itemVotes.filter((vote) => vote.position.value === "for").length;
    const againstCount = itemVotes.filter((vote) => vote.position.value === "against").length;
    const result = item.result.value ?? "other";
    if (result === "other" || itemVotes.length === 0) {
      return { itemId: item.id, result, forCount, againstCount, consistent: true, note: "議決結果または賛否候補が未取得のため判定できません" };
    }
    const consistent = expectedOutcome(result, forCount, againstCount);
    return {
      itemId: item.id, result, forCount, againstCount, consistent,
      note: consistent ? "賛成・反対の集計は議決結果と矛盾しません" : "賛成・反対の集計が議決結果と一致しません。優先して確認してください",
    };
  });
}
