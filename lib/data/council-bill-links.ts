import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import links from "../../data/candidates/himeji-2025-4-council-bill-links.json";
import { validateCouncilBillLinks } from "./council-bill-link-validation";
import { council } from "./council";

const sourceSha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-council-bills.html")).digest("hex");
const byId = validateCouncilBillLinks(links, council.items, sourceSha256);

export function councilBillLinkForId(itemId: string) {
  return byId.get(itemId) ?? null;
}
