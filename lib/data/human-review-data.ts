import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import recordsJson from "../../data/candidates/himeji-2025-4-human-reviews.json";
import locationsJson from "../../data/candidates/himeji-2025-4-vote-locations.json";
import { voteIdsForDecision, validateHumanReviews } from "./human-reviews";
import { pdfSource, voteCandidates } from "./vote-candidates";

const pdfSha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-votes.pdf")).digest("hex");
export const humanReviews = validateHumanReviews(recordsJson, voteCandidates, locationsJson, pdfSha256, pdfSource.url);
export const confirmedVoteIds = voteIdsForDecision(humanReviews, voteCandidates, locationsJson, "verified");
export const correctionVoteIds = voteIdsForDecision(humanReviews, voteCandidates, locationsJson, "needs_correction");
