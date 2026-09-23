import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import topics from "../../data/candidates/himeji-2025-4-question-topics.json";
import { council } from "./council";
import { validateQuestionTopics } from "./question-topic-validation";

const sha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-questions.html")).digest("hex");
const byId = validateQuestionTopics(topics, council.items.map((item) => item.id), sha256);

export function questionTopicsForId(itemId: string) {
  return byId.get(itemId) ?? [];
}
