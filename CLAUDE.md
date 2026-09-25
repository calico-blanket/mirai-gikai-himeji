# Claude Code 向け方針

このプロジェクトの開発方針は [AGENTS.md](./AGENTS.md) に従ってください（Codexと共通）。

作業前に必ず [LESSONS.md](./LESSONS.md) を読み、過去にハマった問題（Windows文字コード、PowerShell 5.1のBOM、Next.jsのモジュール解決など）を再発させないでください。

AGENTS.mdの「Codex workflow」節はClaude Codeにも同様に適用します（Skill化提案、UI変更時のブラウザ確認、大きな変更前の説明など）。

## TypeSafe (Jev) について

[TYPESAFE_TOPICS.md](./TYPESAFE_TOPICS.md) に、分野分類機能でのJev (`jev-1.13.0`, Noulプリミティブ) 利用実績があります。実API呼び出しはキーが必要で課金が発生するため、`npm run topics:prepare`（キー不要の事前確認）と実行スクリプトの違いを理解してから使用してください。新たな用途でJevやTypeSafe APIを検討する場合は、この既存実装のパターン（判定値ベースの保留、人による確認フロー、原文とAI候補の分離）を踏襲してください。
