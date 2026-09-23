import assert from "node:assert/strict";
import test from "node:test";
import {
  councilDataSchema,
  parseCouncilData,
  publishableCouncilDataSchema,
  voteValues,
} from "../lib/data/schema.ts";

// テスト専用の架空データ。公開ページや本番用JSONには使用しない。
const known = (raw, value) => ({ state: "known", raw, value });
const evidence = { sourceIds: ["source-test"], reviewStatus: "verified" };
function validData() {
  return {
    schemaVersion: 1,
    counts: { sessions: 1, items: 1, members: 1, factions: 1, memberships: 1, votes: 1, sources: 1 },
    sessions: [{ id: "session-test", title: known("会期テスト", "会期テスト"), startDate: known("2025-01-01", "2025-01-01"), endDate: known("2025-01-02", "2025-01-02"), ...evidence }],
    items: [{ id: "item-test", sessionId: "session-test", title: known("案件テスト", "案件テスト"), officialNumber: { state: "not_collected", raw: null, value: null }, officialSummary: { state: "not_in_official_source", raw: null, value: null }, result: { state: "not_in_official_source", raw: null, value: null }, fieldEvidence: Object.fromEntries(["title", "officialNumber", "officialSummary", "result"].map((key) => [key, { sourceId: "source-test", retrievedAt: "2025-01-03T09:00:00+09:00", reviewStatus: "verified" }])), ...evidence }],
    members: [{ id: "member-test", name: known("議員テスト", "議員テスト"), ...evidence }],
    factions: [{ id: "faction-test", name: known("会派テスト", "会派テスト"), ...evidence }],
    memberships: [{ id: "membership-test", sessionId: "session-test", memberId: "member-test", factionId: known("会派テスト", "faction-test"), ...evidence }],
    votes: [{ id: "vote-test", itemId: "item-test", memberId: "member-test", membershipId: "membership-test", position: known("賛成", "for"), ...evidence }],
    sources: [{ id: "source-test", title: known("資料テスト", "資料テスト"), url: "https://example.test/source", retrievedAt: "2025-01-03T09:00:00+09:00", reviewStatus: "verified" }],
  };
}

const errors = (data) => {
  const result = councilDataSchema.safeParse(data);
  assert.equal(result.success, false);
  return result.error.issues.map((issue) => issue.path.join("."));
};

test("正常な構造を型付きデータとして読み込める", () => {
  assert.equal(parseCouncilData(validData()).votes[0].position.value, "for");
  assert.equal(publishableCouncilDataSchema.safeParse(validData()).success, true);
});

test("全ての賛否区分と欠測理由を受け入れ、誤った組み合わせは拒否する", () => {
  for (const value of voteValues) {
    const data = validData();
    data.votes[0].position = known("原文", value);
    assert.equal(councilDataSchema.safeParse(data).success, true, value);
  }
  for (const state of ["not_collected", "not_in_official_source", "unknown"]) {
    const data = validData();
    data.votes[0].position = { state, raw: state === "unknown" ? "判読不可" : null, value: null };
    assert.equal(councilDataSchema.safeParse(data).success, true, state);
  }
  const invalid = validData();
  invalid.votes[0].position = { state: "not_collected", raw: null, value: "for" };
  assert(errors(invalid).includes("votes.0.position"));
});

test("宣言件数と実件数の違い、会期不足、IDの重複を検出する", () => {
  const count = validData();
  count.counts.votes = 2;
  assert(errors(count).includes("counts.votes"));

  const noSession = validData();
  noSession.sessions = [];
  assert(errors(noSession).includes("sessions"));

  const duplicate = validData();
  duplicate.sources.push(structuredClone(duplicate.sources[0]));
  duplicate.counts.sources = 2;
  assert(errors(duplicate).includes("sources.1.id"));
});

test("存在しないIDと会期・議員が違う所属行を検出する", () => {
  const missing = validData();
  missing.items[0].sessionId = "missing";
  missing.votes[0].membershipId = "missing";
  missing.members[0].sourceIds = ["missing"];
  const paths = errors(missing);
  assert(paths.includes("items.0.sessionId"));
  assert(paths.includes("votes.0.membershipId"));
  assert(paths.includes("members.0.sourceIds.0"));

  const mismatch = validData();
  mismatch.memberships[0].memberId = "other";
  const mismatchPaths = errors(mismatch);
  assert(mismatchPaths.includes("memberships.0.memberId"));
  assert(mismatchPaths.includes("votes.0.membershipId"));
});

test("同じ案件・議員の票と同一会期の所属重複を検出する", () => {
  const data = validData();
  data.votes.push({ ...structuredClone(data.votes[0]), id: "vote-again" });
  data.counts.votes = 2;
  data.memberships.push({ ...structuredClone(data.memberships[0]), id: "membership-again" });
  data.counts.memberships = 2;
  const paths = errors(data);
  assert(paths.includes("votes.1"));
  assert(paths.includes("memberships.1"));
});

test("不正な日時と未確認データの公開を拒否する", () => {
  const invalidDate = validData();
  invalidDate.sources[0].retrievedAt = "2025-01-03";
  assert(errors(invalidDate).includes("sources.0.retrievedAt"));

  const unreviewed = validData();
  unreviewed.votes[0].reviewStatus = "unreviewed";
  assert.equal(councilDataSchema.safeParse(unreviewed).success, true);
  const result = publishableCouncilDataSchema.safeParse(unreviewed);
  assert.equal(result.success, false);
  assert(result.error.issues.some((issue) => issue.path.join(".") === "votes.0.reviewStatus"));

  const sourceUnreviewed = validData();
  sourceUnreviewed.sources[0].reviewStatus = "needs_correction";
  assert.equal(publishableCouncilDataSchema.safeParse(sourceUnreviewed).success, false);
});

test("議員の現在所属の混入と余分な項目を拒否する", () => {
  const data = validData();
  data.members[0].currentFactionId = "faction-test";
  assert(errors(data).includes("members.0"));
});
