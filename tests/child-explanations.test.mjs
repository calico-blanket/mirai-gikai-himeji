import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadInputs } from "../scripts/classify-himeji-topics.mjs";
import { loadContentTargets } from "../scripts/load-content-targets.mjs";
import { childExplanationDrafts } from "../lib/data/child-explanations.ts";
import { refreshExplanationCandidates, validateExplanations } from "../lib/data/explanation-validation.ts";
import { appendContentReviews, validateContentReviews, contentDigest, explanationDisplay } from "../lib/data/content-reviews.ts";
import { easyTextParts } from "../lib/easy-text.ts";
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const adults=read("data/editorial/himeji-2025-4-explanation-drafts.json"), texts=read("data/editorial/himeji-2025-4-child-explanation-texts.json");
const drafts=childExplanationDrafts(texts,adults), inputs=await loadInputs(), targets=await loadContentTargets();
const snapshot=read("data/candidates/himeji-2025-4-child-explanations.json");
const empty={schemaVersion:1,kind:"content_reviews",sessionId:"himeji-2025-4",records:[]};
function review(kind,id="bill-135") {return {id:randomUUID(),kind,targetId:id,candidateSha256:contentDigest((kind==="child_explanation"?targets.childExplanations:targets.explanations).get(id)),supersedes:null,reviewer:"テスト専用",reviewedAt:new Date().toISOString(),note:"テストの仮記録です。実際の確認ではありません。",originalTextChecked:true,meaningChecked:true,decision:"confirmed"};}
test("小学生向け52件・61項目を原資料へ結び付け、すべて未確認として扱う",()=>{
 const records=validateExplanations(snapshot,inputs,drafts);
 assert.equal(records.size,52);assert.equal([...records.values()].reduce((sum,row)=>sum+row.statements.length,0),61);
 for (const record of records.values()) {assert.equal(record.reviewStatus,"unreviewed");assert.equal(record.inputSha256,targets.explanations.get(record.itemId).inputSha256);}
});
test("大人向けの確認を小学生向けに流用せず、逆方向も流用しない",()=>{
 for (const kind of ["explanation","child_explanation"]) {
  const row=review(kind), active=validateContentReviews(appendContentReviews(empty,{...empty,records:[row]},targets),targets).active;
  const adult=explanationDisplay(targets.explanations.get("bill-135"),active);
  const child=explanationDisplay(targets.childExplanations.get("bill-135"),active,"child_explanation");
  assert.equal(Boolean(adult.review),kind==="explanation");assert.equal(Boolean(child.review),kind==="child_explanation");
 }
 const wrong=review("explanation");wrong.kind="child_explanation";assert.throws(()=>appendContentReviews(empty,{...empty,records:[wrong]},targets));
});
test("小学生向けだけの訂正・保留を反映し、原文と大人向けは維持する",()=>{
 const row={...review("child_explanation"),decision:"corrected",replacement:[{text:"テスト専用の説明",evidenceIds:["title"]}]};
 const active=validateContentReviews({...empty,records:[row]},targets).active;
 assert.equal(explanationDisplay(targets.childExplanations.get("bill-135"),active,"child_explanation").statements[0].text,row.replacement[0].text);
 assert.notEqual(explanationDisplay(targets.explanations.get("bill-135"),active).statements[0].text,row.replacement[0].text);
 const withheld={...review("child_explanation"),decision:"withheld",meaningChecked:false};
 assert.equal(explanationDisplay(targets.childExplanations.get("bill-135"),validateContentReviews({...empty,records:[withheld]},targets).active,"child_explanation").hidden,true);
});
test("変更がなければ作成日時を保ち、1件の更新で他の51件を作り直さない",()=>{
 const time=new Date(Date.now()+1000).toISOString();
 assert.deepEqual(refreshExplanationCandidates(drafts,inputs,time,snapshot),snapshot);
 const changed=structuredClone(drafts);changed[0].statements[0].text+="テスト更新";
 const next=refreshExplanationCandidates(changed,inputs,time,snapshot);
 assert.equal(next.records[0].createdAt,time);assert.deepEqual(next.records.slice(1),snapshot.records.slice(1));
 const active=validateContentReviews({...empty,records:[review("child_explanation")]},{...targets,childExplanations:validateExplanations(next,inputs,changed)});
 assert.equal(active.stale.size,1);assert.equal(active.active.size,0);
});
test("番号欠落・余分な番号・説明数の不一致・確認済みへの書換えを拒否する",()=>{
 for (const mutate of [value=>delete value["bill-135"],value=>value["bill-999"]=["架空"],value=>value["bill-135"].pop()]) {const bad=structuredClone(texts);mutate(bad);assert.throws(()=>childExplanationDrafts(bad,adults));}
 const bad=structuredClone(snapshot);bad.records[0].reviewStatus="verified";assert.throws(()=>validateExplanations(bad,inputs,drafts));
});
test("子ども向けでも金額・年齢・条件・不明な値を保持する",()=>{
 assert.match(texts["bill-135"][0],/1億4,280万円/);assert.match(texts["bill-164"][0],/59億9,337万6,000円/);
 for (const id of ["bill-143","bill-144"]) {assert.match(texts[id][0],/最初の3月31日/);assert.match(texts[id][1],/20人以上から30人以上/);}
 for (const id of ["bill-138","bill-141","bill-142"]) assert.match(texts[id][0],/結果を分かっている場合/);
 assert.match(texts["bill-171"][0],/全員の給料を一律に500円/);
 assert.match(texts["member-bill-7"][0],/分かりません/);assert.match(texts["inquiry-11"][0],/髙馬朗/);
});
test("ふりがなは本文を変更せず、長い語を優先し、人名の読みは推測しない",()=>{
 const text="国民健康保険と介護保険。髙馬朗さん。<script>";const parts=easyTextParts(text);
 assert.equal(parts.map(part=>part.text).join(""),text);assert.equal(parts[0].reading,"こくみんけんこうほけん");
 assert.ok(parts.some(part=>part.text.includes("髙馬朗")&&!part.reading));
 assert.deepEqual(easyTextParts(""),[]);
});
test("小学生向けの事前検証は外部APIなしで動き、候補を書き換えない",()=>{
 const path="data/candidates/himeji-2025-4-child-explanations.json", before=readFileSync(path,"utf8");
 const result=spawnSync(process.execPath,["--experimental-strip-types","scripts/prepare-bill-explanations.mjs","--child"],{encoding:"utf8",env:{...process.env,TYPESAFE_API_KEY:""}});
 assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(path,"utf8"),before);assert.match(result.stdout,/52件/);
});
