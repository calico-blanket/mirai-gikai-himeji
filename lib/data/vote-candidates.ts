import snapshot from "../../data/candidates/himeji-2025-4-vote-candidates.json";
import { council } from "./council";
import { assertCandidateReadyForDisplay } from "./candidate-validation";
import { parseCouncilData, type VoteValue } from "./schema";

// PDFからの機械抽出候補専用。ここでの検証は人による原PDF照合を意味しない。
export const voteCandidates = parseCouncilData(snapshot);

export const pdfSource = assertCandidateReadyForDisplay(voteCandidates, council);

const membershipById = new Map(voteCandidates.memberships.map((membership) => [membership.id, membership]));
const votesByItem = new Map<string, typeof voteCandidates.votes>();
for (const vote of voteCandidates.votes) {
  const rows = votesByItem.get(vote.itemId) ?? [];
  rows.push(vote);
  votesByItem.set(vote.itemId, rows);
}

export function votesForItem(itemId: string) {
  return (votesByItem.get(itemId) ?? []).map((vote) => ({
    vote,
    member: voteCandidates.members.find((member) => member.id === vote.memberId)!,
    membership: membershipById.get(vote.membershipId)!,
  }));
}

export function membersForFaction(factionId: string) {
  return voteCandidates.memberships
    .filter((membership) => membership.factionId.state === "known" && membership.factionId.value === factionId)
    .map((membership) => voteCandidates.members.find((member) => member.id === membership.memberId)!);
}

export function voteLabel(value: VoteValue) {
  switch (value) {
    case "for": return "賛成";
    case "against": return "反対";
    case "absent": return "欠席";
    case "left": return "退席";
    case "recused": return "除斥";
    case "chair_not_voting": return "議長の採決不参加";
  }
}
