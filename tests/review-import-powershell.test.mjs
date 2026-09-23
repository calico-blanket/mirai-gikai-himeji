import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { reviewFileKind } from "../scripts/import-review-file.mjs";
const script=resolve("scripts/apply-content-review.ps1");
test("取り込み補助はBOMを持ち、説明と分類の記録を区別する",()=>{
  assert.deepEqual([...readFileSync(script).subarray(0,3)],[239,187,191]);
  const read=path=>JSON.parse(readFileSync(path,"utf8"));
  assert.equal(reviewFileKind(read("data/candidates/himeji-2025-4-content-reviews.json")),"content");
  assert.equal(reviewFileKind(read("data/candidates/himeji-2025-4-topic-reviews.json")),"topic");
  assert.throws(()=>reviewFileKind(read("data/candidates/himeji-2025-4-explanations.json")));
});
test("Windows PowerShell 5.1で取り込み・検査・失敗時の停止と現在地の復元を確認する",{skip:process.platform!=="win32"},()=>{
  const source=`
    $ErrorActionPreference='Stop'
    [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
    $start=(Get-Location).Path
    $encoding=[Console]::OutputEncoding.CodePage
    function node {
      if ($args[1] -ne 'scripts/import-review-file.mjs' -or $args[2] -ne 'C:\\test-only\\確認記録.json' -or $args[3] -ne '--apply') { throw 'wrong arguments' }
      $global:LASTEXITCODE=$global:testExit
    }
    function npm.cmd { $global:npmCalls++; $global:LASTEXITCODE=0 }
    foreach ($status in @(0,1)) {
      $global:testExit=$status; $global:npmCalls=0; $failed=$false
      try { & $env:REVIEW_TEST_SCRIPT -ReviewFile 'C:\\test-only\\確認記録.json' } catch { $failed=$true }
      if ($failed -ne ($status -eq 1)) { throw 'wrong failure state' }
      $expected=if ($status -eq 0) {2} else {0}
      if ($global:npmCalls -ne $expected) { throw 'continued after failure' }
      if ((Get-Location).Path -ne $start -or [Console]::OutputEncoding.CodePage -ne $encoding) { throw 'state not restored' }
    }
  `;
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=="psmodulepath"));
  const result=spawnSync(`${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe`,["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(source,"utf16le").toString("base64")],{encoding:"utf8",timeout:15000,env:{...env,TYPESAFE_API_KEY:"",REVIEW_TEST_SCRIPT:script}});
  assert.equal(result.status,0,result.stderr);
});
