param([string]$ReviewFile)
# Windows PowerShell 5.1のためUTF-8 BOM付きで保存する。
$ErrorActionPreference = 'Stop'
$reviewPreviousEncoding = [Console]::OutputEncoding
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    if ([string]::IsNullOrWhiteSpace($ReviewFile)) {
        Add-Type -AssemblyName System.Windows.Forms
        $reviewDialog = New-Object System.Windows.Forms.OpenFileDialog
        try {
            $reviewDialog.Title = '画面からダウンロードした確認記録を選択（説明・議論・分野）'
            $reviewDialog.Filter = '確認記録 (*.json)|*.json'
            if ($reviewDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
            $ReviewFile = $reviewDialog.FileName
        } finally { $reviewDialog.Dispose() }
    }
    & node --experimental-strip-types scripts/import-review-file.mjs $ReviewFile --apply
    if ($LASTEXITCODE -ne 0) { throw '確認記録の検証に通りませんでした。サイトへの反映はしていません。' }
    & npm.cmd run test:data
    if ($LASTEXITCODE -ne 0) { throw '保存後のテストで問題が見つかりました。公開せず、Codexにこの画面を見せてください。' }
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw '型チェックで問題が見つかりました。公開せず、Codexにこの画面を見せてください。' }
    Write-Host '確認記録を保存し、検証しました。run-local.cmd で開いたサイトはブラウザを更新すると反映されます。'
    Write-Host '本番ビルドを使って閲覧している場合の再ビルド・再起動はCodexにお任せください。公開はしていません。'
} finally {
    [Console]::OutputEncoding = $reviewPreviousEncoding
    Pop-Location
}
