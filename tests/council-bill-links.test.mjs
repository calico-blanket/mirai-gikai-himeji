import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCouncilBillLinks } from "../lib/data/council-bill-link-validation.ts";

const rows = JSON.parse(readFileSync("data/candidates/himeji-2025-4-council-bill-links.json", "utf8"));
const items = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8")).items;
const sha256 = createHash("sha256").update(readFileSync("data/sources/himeji-2025-4-council-bills.html")).digest("hex");

test("市議会の会期別一覧は全52議案の詳細リンクに対応する", () => {
  const byId = validateCouncilBillLinks(rows, items, sha256);
  assert.equal(byId.size, 52);
  assert.match(byId.get("bill-135").detailUrl, /SrchID=6025/);
  assert.ok(byId.has("member-bill-7"));
  assert.ok(rows.every((row) => row.reviewStatus === "unreviewed"));
});

test("別会期のリンクや一覧差し替え、重複を拒否する", () => {
  const wrongSession = structuredClone(rows);
  wrongSession[0].detailUrl = wrongSession[0].detailUrl.replace("kaigi=122", "kaigi=121");
  assert.throws(() => validateCouncilBillLinks(wrongSession, items, sha256), /形式/);
  assert.throws(() => validateCouncilBillLinks(rows, items, "0".repeat(64)), /版/);
  const duplicate = structuredClone(rows);
  duplicate[1].detailUrl = duplicate[0].detailUrl;
  assert.throws(() => validateCouncilBillLinks(duplicate, items, sha256), /重複/);
});
