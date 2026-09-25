import type { NextConfig } from "next";

// GitHub Pagesはプロジェクトページを https://<user>.github.io/<repo>/ で配信するため、
// リポジトリ名をbasePathに設定する。ローカル開発（npm run dev）では空のままにする。
const basePath = process.env.GITHUB_PAGES === "true" ? "/mirai-gikai-himeji" : "";

const nextConfig: NextConfig = {
  // 既存の作業ルールへの自動追記を防ぐ。
  agentRules: false,
  // 親フォルダーにある別プロジェクトのlockfileに影響されないようにする。
  turbopack: { root: process.cwd() },
  output: "export",
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
