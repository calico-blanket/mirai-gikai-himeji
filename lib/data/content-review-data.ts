import file from "../../data/candidates/himeji-2025-4-content-reviews.json";
import { explanations, childExplanations } from "./explanations";
import { discussions } from "./discussions";
import { validateContentReviews, explanationDisplay, discussionNeedsCorrection } from "./content-reviews";

export const contentTargets = { explanations, childExplanations, discussions: new Map(discussions.rows.map((row) => [row.id, row])) };
export const contentReviews = validateContentReviews(file, contentTargets);
export function explanationDisplayForId(id: string, audience: "adult" | "child" = "adult") {
  const candidate = (audience === "child" ? childExplanations : explanations).get(id);
  return candidate ? explanationDisplay(candidate, contentReviews.active, audience === "child" ? "child_explanation" : "explanation") : undefined;
}
export const rejectedDiscussion = (id: string) => discussionNeedsCorrection(id, contentReviews.active);
