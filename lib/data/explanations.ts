import snapshot from "../../data/candidates/himeji-2025-4-explanations.json";
import drafts from "../../data/editorial/himeji-2025-4-explanation-drafts.json";
import { council } from "./council";
import { discussionsForId } from "./discussions";
import { makeTopicInput } from "./topic-classification";
import { validateExplanations } from "./explanation-validation";
import childSnapshot from "../../data/candidates/himeji-2025-4-child-explanations.json";
import childTexts from "../../data/editorial/himeji-2025-4-child-explanation-texts.json";
import { childExplanationDrafts } from "./child-explanations";

const inputs = council.items.map((item) => makeTopicInput(item, council.sources, discussionsForId(item.id).find((row) => row.kind === "proposal")));
export const explanations = validateExplanations(snapshot, inputs, drafts);
export const childExplanations = validateExplanations(childSnapshot, inputs, childExplanationDrafts(childTexts, drafts));
export const explanationForId = (id: string) => explanations.get(id);
