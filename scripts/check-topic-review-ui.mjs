// ローカルChromeで実画面・フォームを検証。API通信・本番台帳への記録は行わない。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { loadInputs } from "./classify-himeji-topics.mjs";
import { validateTopicCandidates, topicView } from "../lib/data/topic-classification.ts";
import { appendTopicReviews } from "../lib/data/topic-reviews.ts";
import { validateExplanations, explanationReviewReasons } from "../lib/data/explanation-validation.ts";
import { loadContentTargets } from "./load-content-targets.mjs";
import { appendContentReviews } from "../lib/data/content-reviews.ts";

const base = "http://127.0.0.1:3005";
const folder = await mkdtemp(join(tmpdir(), "himeji-topic-ui-"));
const downloads = join(folder, "downloads");
await mkdir(downloads);
const reportDir = resolve("reports/topic-review-ui");
await mkdir(reportDir, { recursive: true });
const environment = { ...process.env }; delete environment.TYPESAFE_API_KEY;
const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(folder, "profile")}`, "about:blank"], { windowsHide: true, stdio: "ignore", env: environment });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 100; i++) { const value = await fn(); if (value) return value; await wait(100); } throw new Error("画面確認が時間内に完了しませんでした"); }
let ws;
try {
  const port = await until(async () => { try { return (await readFile(join(folder, "profile/DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return null; } });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map(); const errors = []; const externalRequests = [];
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id) { const handler = pending.get(message.id); pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && /^https?:/.test(message.params.request.url) && new URL(message.params.request.url).origin !== base) externalRequests.push(message.params.request.url);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  const evidence = [];
  const inputs = await loadInputs();
  const contentTargets = await loadContentTargets();
  const candidates = validateTopicCandidates(JSON.parse(await readFile("data/candidates/himeji-2025-4-topics.json", "utf8")), inputs);
  const explanations = validateExplanations(JSON.parse(await readFile("data/candidates/himeji-2025-4-explanations.json", "utf8")), inputs, JSON.parse(await readFile("data/editorial/himeji-2025-4-explanation-drafts.json", "utf8")));
  async function visit(path) {
    await cdp("Page.navigate", { url: base + path });
    await until(() => evaluate(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState === 'complete' && Boolean(document.querySelector('h1'))`));
    await wait(400);
  }
  for (const width of [375, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
    for (const path of ["/", "/gians", "/gians/bill-135", "/gians/bill-140", "/gians/bill-143", "/gians/bill-147", "/gians/member-bill-7", "/members", "/review"]) {
      await visit(path);
      const dimensions = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
      assert.equal(dimensions.width, width); assert.ok(dimensions.scroll <= width, `${path}: 横はみ出し`);
      evidence.push({ path, width, ...dimensions });
      assert.ok(await evaluate("document.querySelector('footer').innerText.includes('これは政党チームみらいが運営しているものではありません')"));
      assert.ok(await evaluate("document.querySelector('footer a[href=\"https://gikai.team-mir.ai/\"]') !== null"));
      assert.ok(await evaluate("document.querySelector('footer a[href=\"https://github.com/calico-blanket/mirai-gikai-himeji\"]') !== null"));
      assert.equal(await evaluate("document.querySelector('footer').innerText.includes('本家')"), false);
      if (path === "/") {
        assert.equal(await evaluate("document.querySelector('meta[name=theme-color]').content"), "#245d69");
        const og = await evaluate("document.querySelector('meta[property=\"og:image\"]').content");
        const result = await fetch(og); assert.equal(result.status, 200); assert.match(result.headers.get('content-type'), /image\/png/);
        await writeFile(join(reportDir,"independent-og.png"),Buffer.from(await result.arrayBuffer()));
        await evaluate("document.querySelector('footer').scrollIntoView()");
        await writeFile(join(reportDir,`${width}-independence-footer.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
        await evaluate("window.scrollTo(0,0)");
      }
      if (path === "/gians") {
        for (const [value, expected] of [["__withheld", [...candidates.values()].filter((row) => topicView(row).state === "withheld").length], ["__not_generated", inputs.length - candidates.size], ["children_education", [...candidates.values()].filter((row) => topicView(row).topics.some((topic) => topic.id === "children_education")).length], ["", inputs.length]]) {
          await evaluate(`(() => { const select = document.querySelector('#bill-topic'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
          await until(() => evaluate(`document.querySelector('[role=status]').textContent === ${JSON.stringify(`${inputs.length}件中${expected}件を表示`)}`));
          evidence.push({ width, topicFilter: value || "all", expected, passed: true });
        }
        await evaluate("(() => { const el = document.querySelector('#bill-query'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'グランドピアノ'); el.dispatchEvent(new Event('input',{bubbles:true})); })()");
        await until(() => evaluate("document.querySelector('[role=status]').textContent === '52件中1件を表示'"));
        assert.ok(await evaluate("Boolean(document.querySelector('h2 a[href^=\"/gians/bill-135\"]'))"), "説明文の言葉で議案を探せる");
        evidence.push({ width, explanationSearch: "グランドピアノ", matchingItem: "bill-135" });
        await evaluate("(() => { const el = document.querySelector('#bill-query'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input',{bubbles:true})); })()");
        await until(() => evaluate("document.querySelector('[role=status]').textContent === '52件中52件を表示'"));
      }
      if (path.startsWith("/gians/")) {
        const record = explanations.get(path.split("/").at(-1));
        assert.equal(await evaluate("document.querySelectorAll('[data-explanation-evidence=adult]').length"), record.statements.length);
        for (const statement of record.statements) assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(statement.text)})`));
        assert.ok(await evaluate("document.body.innerText.includes('AI作成の説明案・人による確認前')"));
        const evidenceIds = record.statements[0].evidenceIds;
        await evaluate("document.querySelector('[data-explanation-evidence=adult] summary').focus()");
        assert.equal(await evaluate("document.activeElement.tagName"), "SUMMARY");
        await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
        await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await until(() => evaluate("document.querySelector('[data-explanation-evidence=adult]').open"));
        assert.equal(await evaluate("document.querySelectorAll('[data-explanation-evidence=adult]:first-of-type blockquote').length >= 1"), true);
        await evaluate("document.querySelector('#explanation-heading').scrollIntoView()");
        evidence.push({ width, path, explanationStatements: record.statements.length, firstEvidence: evidenceIds, keyboardDisclosure: true });
      }
      if (path === "/review") {
        assert.equal(await evaluate("document.querySelector('#content-target').options.length"), contentTargets.explanations.size);
        assert.equal(await evaluate("document.querySelector('#review-topic-item').options.length"), candidates.size, "保存済み全件を照合できる");
        const expected = [...explanations.values()].filter((row) => explanationReviewReasons(row).length).length;
        assert.ok(await evaluate(`document.querySelector('#explanation-review-heading').parentElement.innerText.includes(${JSON.stringify(`優先して見比べる${expected}件`)})`));
      }
      if (path === "/review") await evaluate("document.querySelector('#review-topic-item').scrollIntoView()");
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      await writeFile(join(reportDir, `${width}-${path.replaceAll('/', '_') || 'home'}.png`), Buffer.from(shot.data, "base64"));
    }
    await evaluate("document.querySelector('#topic-review-form').scrollIntoView()");
    await writeFile(join(reportDir, `${width}-review-form.png`), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await evaluate("document.querySelector('#content-review-heading').scrollIntoView()");
    await writeFile(join(reportDir, `${width}-content-workbench.png`), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    // 小学生向けへの切り替え、ページ移動・再読込後の保持、原資料の不変を確認。
    await evaluate("[...document.querySelectorAll('.reader-switch button')].find(button=>button.textContent==='小学生向け').focus()");
    await cdp("Input.dispatchKeyEvent", { type:"keyDown", key:"Enter", code:"Enter", text:"\r", unmodifiedText:"\r", windowsVirtualKeyCode:13 });
    await cdp("Input.dispatchKeyEvent", { type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13 });
    for (const childPath of ["/", "/gians", "/gians/bill-135", "/gians/bill-143", "/gians/member-bill-7"]) {
      await visit(childPath);
      await until(()=>evaluate("[...document.querySelectorAll('.reader-switch button')].some(button=>button.textContent==='小学生向け'&&button.getAttribute('aria-pressed')==='true')"));
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"小学生向けで横はみ出ししない");
      if (childPath.startsWith("/gians/")) {
        const record=contentTargets.childExplanations.get(childPath.split('/').at(-1));
        assert.equal(await evaluate("document.querySelectorAll('[data-reader-content=child]:not([hidden]) [data-explanation-evidence=child]').length"),record.statements.length);
        assert.ok(await evaluate("document.querySelector('[data-reader-content=adult]').hidden"));
        assert.ok(await evaluate("document.querySelector('[data-reader-content=adult] a').getClientRects().length===0"));
        assert.ok(await evaluate("document.querySelector('[data-reader-content=child] ruby')!==null"));
        const raw=await evaluate("document.querySelector('[data-explanation-evidence=child] blockquote').textContent");
        assert.equal(raw,await evaluate("document.querySelector('[data-explanation-evidence=adult] blockquote').textContent"));
        await evaluate("document.querySelector('#explanation-heading').scrollIntoView()");
      }
      await writeFile(join(reportDir,`${width}-child-${childPath.replaceAll('/','_')||'home'}.png`),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      evidence.push({width,path:childPath,childMode:"keyboard switch, persisted on navigation, no horizontal overflow"});
    }
    const ax=await cdp("Accessibility.getFullAXTree");
    const switches=ax.nodes.filter(node=>!node.ignored&&node.role?.value==='button'&&['大人向け','小学生向け'].includes(node.name?.value));
    assert.equal(switches.length,2);assert.equal(switches.find(node=>node.name.value==='小学生向け').properties.find(prop=>prop.name==='pressed').value.value,'true');
    await evaluate("[...document.querySelectorAll('.reader-switch button')].find(button=>button.textContent==='大人向け').click()");
    await visit('/review');
  }
  // 検索の直リンク、再読み込み、詳細からの戻り先を実ブラウザで確認する。
  await visit("/gians?q=" + encodeURIComponent("グランドピアノ"));
  await until(() => evaluate("document.querySelector('[role=status]').textContent === '52件中1件を表示'"));
  const detailPath = await evaluate("document.querySelector('h2 a').getAttribute('href')");
  assert.ok(detailPath.startsWith("/gians/bill-135?list="));
  await visit(detailPath);
  const backPath = await evaluate("document.querySelector('nav[aria-label=\"ほかの議案へ移動\"] a').getAttribute('href')");
  assert.equal(new URL(base + backPath).searchParams.get("q"), "グランドピアノ");
  await visit(backPath);
  await until(() => evaluate("document.querySelector('[role=status]').textContent === '52件中1件を表示'"));
  evidence.push({ searchUrlAndDetailReturn: "pass" });
  await visit("/review");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.documentElement.style.fontSize = '200%'");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "320px・文字200%で横はみ出し");
  await evaluate("document.documentElement.style.fontSize = ''");
  await visit("/gians/bill-143");
  await evaluate("document.documentElement.style.fontSize = '200%'; document.querySelector('[data-explanation-evidence=adult]').open = true");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "要点と原文が320px・文字200%で横はみ出ししない");
  await evaluate("[...document.querySelectorAll('.reader-switch button')].find(button=>button.textContent==='小学生向け').click()");
  await wait(100);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"),"小学生向けのふりがな・320px・文字200%で横はみ出ししない");
  await evaluate("[...document.querySelectorAll('.reader-switch button')].find(button=>button.textContent==='大人向け').click()");
  await visit("/review");
  for (const [itemId, decision] of [["bill-135", "withheld"], ["bill-140", "confirmed"], ["bill-154", "corrected"]]) {
    await evaluate(`(() => { const select = document.querySelector('#review-topic-item'); select.value = ${JSON.stringify(itemId)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await wait(150);
    assert.equal(await evaluate("document.querySelectorAll('#topic-review-form input:checked').length"), 0, "判断を事前選択しない");
    assert.equal(await evaluate("document.querySelector('#topic-review-form').checkValidity()"), false, "空欄を許可しない");
    await evaluate(`document.querySelector('input[name=decision][value=${decision}]').click()`);
    await wait(100);
    if (decision === "corrected") await evaluate("document.querySelectorAll('#topic-review-form fieldset')[1].querySelector('input').click()");
    await evaluate(`(() => {
      const set = (id, value, proto) => { const element = document.getElementById(id); Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); };
      set('topic-reviewer', 'UIテスト専用・公開しない', HTMLInputElement.prototype);
      set('topic-note', '自動テストの仮記録です。人の照合ではなく本番には反映しません。', HTMLTextAreaElement.prototype);
      document.querySelector('input[name=compared]').click();
    })()`);
    await wait(100);
    await evaluate("document.querySelector('#topic-review-form button').click()");
    const downloaded = await until(async () => { try { return JSON.parse(await readFile(join(downloads, `topic-review-${itemId}.json`), "utf8")); } catch { return null; } });
    assert.equal(downloaded.records[0].decision, decision);
    appendTopicReviews({ schemaVersion: 1, sessionId: "himeji-2025-4", records: [] }, downloaded, candidates);
    evidence.push({ itemId, decision, downloadAndValidation: "pass; test file only" });
  }
  const discussionId = contentTargets.explanations.get("bill-135").input.proposal.associationId;
  for (const [kind, target, decision] of [["explanation", "bill-135", "confirmed"], ["explanation", "bill-143", "corrected"], ["discussion", discussionId, "rejected"], ["child_explanation", "bill-143", "confirmed"]]) {
    await evaluate(`(() => { const select=document.querySelector('#content-kind'); select.value=${JSON.stringify(kind)}; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await wait(100);
    await evaluate(`(() => { const select=document.querySelector('#content-target'); select.value=${JSON.stringify(target)}; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await wait(100);
    assert.equal(await evaluate("document.querySelectorAll('#content-review-form input:checked').length"),0);
    assert.equal(await evaluate("document.querySelector('#content-review-form').checkValidity()"),false);
    await evaluate(`document.querySelector('#content-review-form input[value=${decision}]').click()`);
    await wait(100);
    await evaluate(`(() => {
      const set=(id,value,proto)=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
      set('content-reviewer','UIテスト専用・反映しない',HTMLInputElement.prototype);
      set('content-note','自動テスト用の仮記録。本番には反映しません。',HTMLTextAreaElement.prototype);
      if (${JSON.stringify(decision)} === 'corrected') set('replacement-0','テスト用の訂正文。実際の説明ではありません。',HTMLTextAreaElement.prototype);
      document.querySelector('#content-review-form input[name=original]').click();
      if (${JSON.stringify(decision)} !== 'rejected') document.querySelector('#content-review-form input[name=meaning]').click();
    })()`);
    await wait(100);
    await evaluate("document.querySelector('#content-review-form button[type=submit]').click()");
    await wait(100);
    assert.equal(await evaluate("document.querySelectorAll('#content-review-form [role=alert]').length"),0);
  }
  assert.ok(await evaluate("document.body.innerText.includes('保存待ち：4件')"));
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='保存待ち4件をまとめてダウンロード').click()");
  const contentDownload = await until(async()=>{const name=(await readdir(downloads)).find(name=>name.startsWith('himeji-content-reviews-')&&name.endsWith('.json'));return name ? JSON.parse(await readFile(join(downloads,name),'utf8')) : null;});
  assert.equal(contentDownload.records.length,4);
  appendContentReviews({schemaVersion:1,kind:"content_reviews",sessionId:"himeji-2025-4",records:[]},contentDownload,contentTargets);
  evidence.push({ contentBatchDownload: "4 records; adult and child independently; confirmed, corrected, rejected; validation passed; not imported" });
  await evaluate("document.querySelector('#review-topic-item').focus()");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const focus = await evaluate("({ tag:document.activeElement.tagName, outline:getComputedStyle(document.activeElement).outlineStyle })");
  assert.notEqual(focus.tag, "BODY"); assert.equal(focus.outline, "solid");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], "閲覧・切り替え・確認入力で外部APIへ通信しない");
  evidence.push({ narrowText200Percent: "pass", keyboardFocus: focus, runtimeErrors: errors, externalRequests });
  await writeFile(join(reportDir, "results.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log("375px・1280pxで9ページと小学生向け5ページ、読み方のキーボード切り替えと保持、検索・原文、320px文字200%、両読者を分けた4件の判断保存を確認。外部通信0件・実際の台帳は未変更。");
  await cdp("Browser.close");
} finally {
  ws?.close(); browser.kill();
  await wait(1000);
  // 今回mkdtempで作った専用一時領域だけを削除する。
  await rm(folder, { recursive: true, force: true }).catch(() => {});
}
