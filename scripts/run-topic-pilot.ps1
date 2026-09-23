# Windows PowerShell 5.1用に、このファイルはUTF-8 BOM付きで保存する。
# キーをコマンド履歴やファイルに書かず、このプロセスと子プロセスだけに渡す。
param([switch]$All)
$ErrorActionPreference = 'Stop'
$topicPreviousKey = $env:TYPESAFE_API_KEY
$topicSecret = $null
$topicPointer = [IntPtr]::Zero
$topicPreviousConsoleEncoding = [Console]::OutputEncoding
$topicPreviousOutputEncoding = $OutputEncoding
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    if ([string]::IsNullOrWhiteSpace($env:TYPESAFE_API_KEY)) {
        $topicSecret = Read-Host -AsSecureString -Prompt 'TypeSafe APIキー（入力は非表示・保存しません）'
        $topicPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($topicSecret)
        $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($topicPointer)
    }
    $topicArguments = @('--experimental-strip-types', 'scripts/classify-himeji-topics.mjs', '--run')
    if ($All) { $topicArguments += '--all' }
    & node @topicArguments
    if ($LASTEXITCODE -ne 0) { throw '分類処理は完了していません。上の安全なエラーメッセージを確認してください。' }
} finally {
    $env:TYPESAFE_API_KEY = $topicPreviousKey
    $topicPreviousKey = $null
    if ($topicPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($topicPointer) }
    if ($null -ne $topicSecret) { $topicSecret.Dispose() }
    [Console]::OutputEncoding = $topicPreviousConsoleEncoding
    $OutputEncoding = $topicPreviousOutputEncoding
    Pop-Location
}
