# GitHub Pagesへの手動デプロイ。
# data/sources（原資料）はGit管理外・CI非対応のため、ローカルでビルドしたout/を
# gh-pagesブランチへ直接反映する。実行前にnpm run test:dataとbuild（このスクリプト内）を通す。

$ErrorActionPreference = "Stop"
$root = git rev-parse --show-toplevel
Set-Location $root

Write-Host "=== typecheck ==="
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheckが失敗しました" }

Write-Host "=== test:data ==="
npm run test:data
if ($LASTEXITCODE -ne 0) { throw "test:dataが失敗しました" }

Write-Host "=== build (static export) ==="
$env:GITHUB_PAGES = "true"
npm run build
$env:GITHUB_PAGES = $null
if ($LASTEXITCODE -ne 0) { throw "buildが失敗しました" }
if (-not (Test-Path "out/index.html")) { throw "out/index.htmlが生成されていません" }

$worktreePath = Join-Path $root ".work/gh-pages-worktree"
if (Test-Path $worktreePath) {
    Remove-Item -Recurse -Force $worktreePath
}

$branchExists = git ls-remote --heads origin gh-pages
if ($branchExists) {
    git worktree add $worktreePath gh-pages
} else {
    git worktree add --orphan -b gh-pages $worktreePath
}

Get-ChildItem $worktreePath -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Copy-Item -Path "out/*" -Destination $worktreePath -Recurse -Force
New-Item -ItemType File -Path (Join-Path $worktreePath ".nojekyll") -Force | Out-Null

Set-Location $worktreePath
git add -A
$hasChanges = git status --porcelain
if (-not $hasChanges) {
    Write-Host "変更なし。デプロイをスキップします。"
} else {
    git commit -m "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git push origin gh-pages
    Write-Host "=== デプロイ完了。数分後に https://calico-blanket.github.io/mirai-gikai-himeji/ で確認できます ==="
}

Set-Location $root
git worktree remove $worktreePath --force
