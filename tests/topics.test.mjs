import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeTopicInput, makeTopicRequest, makeTopicRecord, validateTopicCandidates, topicDefinitions, topicPolicy, topicView, topicResponseSchema } from "../lib/data/topic-classification.ts";
import { requestTopicClassification, safeFailureMessage } from "../scripts/typesafe-client.mjs";
import { parseOptions } from "../scripts/classify-himeji-topics.mjs";
import { matchesTopicFilter } from "../lib/topic-filter.ts";

const council = JSON.parse(readFileSync("data/himeji-2025-4.json", "utf8"));
const input = makeTopicInput(council.items[0], council.sources);
const response = () => ({ model: topicPolicy.model, answers: Object.fromEntries(["evidence_sufficient", ...topicDefinitions.map((topic) => topic.id)].map((id) => [id, { type: "noul", noul: id === "evidence_sufficient" || id === "finance" ? 0.95 : 0.1 }])), usage: { input_tokens: 200, output_tokens: 40 } });
const record = () => makeTopicRecord(input, response(), "2026-09-23T01:00:00Z");
const file = (records) => ({ schemaVersion: 1, sessionId: "himeji-2025-4", records });

test("分類は未作成・保留・複数候補を区別し、高い値もverifiedにしない", () => {
  assert.equal(topicView().state, "not_generated");
  const multiple = record();
  multiple.response.answers.culture_sport.noul = 0.9;
  assert.equal(topicView(multiple).topics.length, 2);
  assert.equal(multiple.reviewStatus, "unreviewed");
  multiple.response.answers.evidence_sufficient.noul = 0.79;
  assert.equal(topicView(multiple).state, "withheld");
  assert.equal(topicView(multiple).topics.length, 0);
  multiple.response.answers.evidence_sufficient.noul = 0.8;
  for (const topic of topicDefinitions) multiple.response.answers[topic.id].noul = 0.5;
  assert.equal(topicView(multiple).state, "withheld");
});

test("原文・出典・ルール変更、架空の参照、重複、verifiedを検出する", () => {
  assert.equal(validateTopicCandidates(file([record()]), [input]).size, 1);
  for (const mutate of [
    (row) => { row.input.fields[1].raw += "別の内容"; },
    (row) => { row.input.fields[1].sourceUrl = "https://example.com/fake"; },
    (row) => { row.requestSha256 = "0".repeat(64); },
    (row) => { row.taxonomyVersion = "old"; },
    (row) => { row.itemId = "bill-999"; },
    (row) => { row.reviewStatus = "verified"; },
  ]) { const row = record(); mutate(row); assert.throws(() => validateTopicCandidates(file([row]), [input])); }
  assert.throws(() => validateTopicCandidates(file([record(), record()]), [input]), /重複/);
  const changed = structuredClone(input); changed.fields[1].raw += "改訂";
  assert.throws(() => validateTopicCandidates(file([record()]), [changed]), /更新/);
});

test("応答の不足、余計な判定、範囲外・非数値、モデル違いを拒否する", () => {
  for (const mutate of [
    (value) => { delete value.answers.finance; },
    (value) => { value.answers.extra = { type: "noul", noul: 0.9 }; },
    (value) => { value.answers.finance.noul = 1.01; },
    (value) => { value.answers.finance.noul = "0.9"; },
    (value) => { value.answers.finance.noul = NaN; },
    (value) => { value.model = "jev-latest"; },
  ]) { const invalid = response(); mutate(invalid); assert.throws(() => topicResponseSchema.parse(invalid)); }
});

test("送信先固定・リダイレクト禁止・キーはヘッダーだけ・未知の応答項目を保存しない", async () => {
  const secret = "test-only-not-a-real-key";
  const request = makeTopicRequest(input);
  const result = await requestTopicClassification(request, { apiKey: secret, fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.ok(!options.body.includes(secret));
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ...response(), debug: secret, request_headers: { Authorization: secret } }));
  } });
  assert.ok(!JSON.stringify(makeTopicRecord(input, result, "2026-09-23T01:00:00Z")).includes(secret));
});

test("キーなしでは通信せず、例外や401本文に含まれる秘密をログ文へ含めない", async () => {
  let calls = 0;
  await assert.rejects(requestTopicClassification(makeTopicRequest(input), { apiKey: "", fetchImpl: async () => { calls++; } }), /KEY_MISSING/);
  assert.equal(calls, 0);
  const secret = "test-secret-never-print";
  for (const fetchImpl of [async () => { throw new Error(secret); }, async () => new Response(secret, { status: 401 }), async () => new Response(JSON.stringify({ secret }))]) {
    try { await requestTopicClassification(makeTopicRequest(input), { apiKey: secret, fetchImpl }); assert.fail("拒否が必要"); }
    catch (error) { assert.ok(!error.message.includes(secret)); assert.ok(!safeFailureMessage(error).includes(secret)); }
  }
  assert.ok(!safeFailureMessage(new Error(secret)).includes(secret));
});

test("429は待って一度だけ再試行し、長いRetry-Afterと継続エラーでは停止する", async () => {
  let calls = 0; const sleeps = [];
  const result = await requestTopicClassification(makeTopicRequest(input), { apiKey: "test", fetchImpl: async () => ++calls === 1 ? new Response("", { status: 429, headers: { "Retry-After": "2" } }) : new Response(JSON.stringify(response())), sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(result.model, topicPolicy.model); assert.equal(calls, 2); assert.deepEqual(sleeps, [2000]);
  calls = 0;
  await assert.rejects(requestTopicClassification(makeTopicRequest(input), { apiKey: "test", fetchImpl: async () => { calls++; return new Response("", { status: 529 }); }, sleep: async () => {} }), /RATE_LIMITED/);
  assert.equal(calls, 2);
  await assert.rejects(requestTopicClassification(makeTopicRequest(input), { apiKey: "test", fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "90" } }), sleep: async () => assert.fail("長い待機は停止する") }), /RATE_LIMITED/);
  await assert.rejects(requestTopicClassification(makeTopicRequest(input), { apiKey: "test", fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": new Date(Date.now() + 90000).toUTCString() } }), sleep: async () => assert.fail("日時形式の長い待機も停止する") }), /RATE_LIMITED/);
});

test("分類フィルターで未生成を除外せず、複数候補と保留を区別する", () => {
  const data = [
    { topicState: "not_generated", topics: [] },
    { topicState: "withheld", topics: [] },
    { topicState: "candidate", topics: [{ id: "finance", label: "予算・財政" }, { id: "culture_sport", label: "文化・スポーツ" }] },
  ];
  assert.equal(data.filter((item) => matchesTopicFilter(item, "")).length, 3);
  for (const filter of ["__not_generated", "__withheld", "finance", "culture_sport"]) assert.equal(data.filter((item) => matchesTopicFilter(item, filter)).length, 1);
});

test("既定の試行は3件で、CLIの誤指定を拒否し、キーなし実行はファイルを変えない", () => {
  assert.deepEqual(parseOptions([], council.items.map((item) => item.id)).ids, ["bill-135", "bill-140", "bill-154"]);
  for (const args of [["--unknown"], ["--all", "--items=bill-135"], ["--items=bill-135,bill-135"], ["--items=bill-999"]]) assert.throws(() => parseOptions(args, council.items.map((item) => item.id)));
  const path = "data/candidates/himeji-2025-4-topics.json";
  const before = readFileSync(path, "utf8");
  const execution = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/classify-himeji-topics.mjs", "--run"], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "" } });
  assert.equal(execution.status, 1); assert.match(execution.stderr, /未設定/);
  assert.equal(readFileSync(path, "utf8"), before);
});
