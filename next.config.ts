import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 既存の作業ルールへの自動追記を防ぐ。
  agentRules: false,
  // 親フォルダーにある別プロジェクトのlockfileに影響されないようにする。
  turbopack: { root: process.cwd() },
};

export default nextConfig;
