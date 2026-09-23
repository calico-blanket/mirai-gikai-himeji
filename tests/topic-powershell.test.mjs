import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/run-topic-pilot.ps1");
const windowsPowerShell = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
// Node経由ではPowerShell 7のモジュールパスが残る。5.1の標準探索を使う。
const testEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"));
const run = (source) => spawnSync(windowsPowerShell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")], {
  encoding: "utf8", timeout: 15000, env: { ...testEnvironment, TYPESAFE_API_KEY: "", TOPIC_TEST_SCRIPT: scriptPath },
});

test("日本語の実行スクリプトはWindows PowerShell 5.1向けUTF-8 BOMを持つ", () => {
  assert.deepEqual([...readFileSync(scriptPath).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("Windows PowerShell 5.1でもRead-Hostを非表示入力として正しく解釈する", { skip: process.platform !== "win32" }, () => {
  const result = run(`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $t = $null; $e = $null
    $a = [Management.Automation.Language.Parser]::ParseFile($env:TOPIC_TEST_SCRIPT, [ref]$t, [ref]$e)
    $r = @($a.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Read-Host' }, $true))
    if ($e.Count -ne 0 -or $r.Count -ne 1) { throw 'parse failed' }
    $secure = @($r[0].CommandElements | Where-Object { $_.ParameterName -eq 'AsSecureString' })
    if ($secure.Count -ne 1) { throw 'secure parameter missing' }
    if ($r[0].Extent.Text -notmatch '入力は非表示・保存しません' -or $r[0].Extent.Text.Contains([char]10)) { throw 'prompt corrupted' }
    Write-Output 'Windows PowerShell 5.1: secure prompt parsed correctly'
  `);
  assert.equal(result.status, 0, result.stderr);
});

test("Windows PowerShell 5.1でキー非表示入力・子への引継ぎ・成功と失敗時の復元を実行検証する", { skip: process.platform !== "win32" }, () => {
  // 画面入力とAPIコマンドを差し替える。実キー・実通信は使用しない。
  const result = run(`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $global:topicPromptCalls = 0
    $global:topicNodeCalls = 0
    function Read-Host {
      param([switch]$AsSecureString, [string]$Prompt)
      if (!$AsSecureString -or $Prompt -ne 'TypeSafe APIキー（入力は非表示・保存しません）') { throw 'insecure or corrupt prompt' }
      $global:topicPromptCalls++
      ConvertTo-SecureString 'mock-only-not-a-real-key' -AsPlainText -Force
    }
    function node {
      if ($env:TYPESAFE_API_KEY -ne $global:topicExpectedKey) { throw 'wrong child environment' }
      if (($args -join ' ').Contains($env:TYPESAFE_API_KEY)) { throw 'key passed in arguments' }
      if ([Console]::OutputEncoding.CodePage -ne 65001 -or $OutputEncoding.CodePage -ne 65001) { throw 'wrong output encoding' }
      $global:topicNodeCalls++
      $global:LASTEXITCODE = $global:topicExitStatus
    }
    $startDirectory = (Get-Location).Path
    $startCodePage = [Console]::OutputEncoding.CodePage
    $startOutputCodePage = $OutputEncoding.CodePage
    foreach ($existing in @('', 'mock-existing-not-a-real-key')) {
      foreach ($status in @(0, 1)) {
        $env:TYPESAFE_API_KEY = $existing
        $global:topicExpectedKey = if ($existing) { $existing } else { 'mock-only-not-a-real-key' }
        $global:topicExitStatus = $status
        $failed = $false
        $failureId = ''
        try { & $env:TOPIC_TEST_SCRIPT } catch { $failed = $true; $failureId = $_.FullyQualifiedErrorId }
        if ($failed -ne ($status -ne 0)) { throw ('wrong failure behavior: ' + $failureId) }
        if ([string]$env:TYPESAFE_API_KEY -ne $existing) { throw 'environment not restored' }
        if ((Get-Location).Path -ne $startDirectory) { throw 'directory not restored' }
        if ([Console]::OutputEncoding.CodePage -ne $startCodePage -or $OutputEncoding.CodePage -ne $startOutputCodePage) { throw 'encoding not restored' }
      }
    }
    if ($global:topicPromptCalls -ne 2 -or $global:topicNodeCalls -ne 4) { throw 'unexpected invocation count' }
    Write-Output 'secure input, child environment and cleanup: OK'
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("mock-only-not-a-real-key"));
  assert.ok(!result.stdout.includes("mock-existing-not-a-real-key"));
});

test("Windows PowerShell 5.1でNode.jsの日本語出力をUTF-8で受け取れる", { skip: process.platform !== "win32" }, () => {
  const result = run(`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $global:topicActualNode = (Get-Command node.exe).Source
    $env:TYPESAFE_API_KEY = 'mock-only-no-network'
    function node {
      & $global:topicActualNode -e 'process.stdout.write(String.fromCharCode(${Array.from("分類の事前確認：正常", (char) => char.charCodeAt(0)).join(",")}));'
      if ($LASTEXITCODE -ne 0) { throw 'native output check failed' }
    }
    & $env:TOPIC_TEST_SCRIPT
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("分類の事前確認：正常"));
});

test("Windows PowerShell 5.1で-All指定時だけ全件生成の引数を渡す", { skip: process.platform !== "win32" }, () => {
  const result = run(`
    $ErrorActionPreference = 'Stop'
    $env:TYPESAFE_API_KEY = 'mock-only-no-network'
    $global:topicExpectAll = $false
    function node {
      if (($args -contains '--all') -ne $global:topicExpectAll) { throw 'wrong all option' }
      if (!($args -contains '--run')) { throw 'missing run option' }
      $global:LASTEXITCODE = 0
    }
    & $env:TOPIC_TEST_SCRIPT
    $global:topicExpectAll = $true
    & $env:TOPIC_TEST_SCRIPT -All
  `);
  assert.equal(result.status, 0, result.stderr);
});
