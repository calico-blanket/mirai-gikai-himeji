import candidate from "../../data/candidates/himeji-2025-4-topics.json";
import { council } from "./council";
import { discussionsForId } from "./discussions";
import { makeTopicInput, validateTopicCandidates } from "./topic-classification";
import reviews from "../../data/candidates/himeji-2025-4-topic-reviews.json";
import { validateTopicReviews, reviewedTopicView } from "./topic-reviews";
import { rejectedDiscussion } from "./content-review-data";

export const topicInputs = council.items.map((item) => makeTopicInput(item, council.sources, discussionsForId(item.id).find((row) => row.kind === "proposal")));
export const topicCandidates = validateTopicCandidates(candidate, topicInputs);
export const topicReviews = validateTopicReviews(reviews, topicCandidates);
export function topicsForId(itemId: string) {
  const candidate = topicCandidates.get(itemId);
  const view = reviewedTopicView(candidate, topicReviews.active.get(itemId));
  const sourceIssue = Boolean(candidate?.input.proposal && rejectedDiscussion(candidate.input.proposal.associationId));
  return sourceIssue ? { state: "withheld" as const, topics: [], review: undefined, sourceIssue } : { ...view, sourceIssue };
}
