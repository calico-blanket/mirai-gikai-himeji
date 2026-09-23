import { topicResponseSchema } from "../lib/data/topic-classification.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export class TypeSafeRequestError extends Error {
  constructor(code) { super(code); this.name = "TypeSafeRequestError"; }
}

export async function requestTopicClassification(request, { apiKey, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 30000 } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new TypeSafeRequestError("KEY_MISSING");
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch {
      // 例外・ヘッダー・本文にはキーが含まれる可能性があるため出力しない。
      throw new TypeSafeRequestError("NETWORK_OR_TIMEOUT");
    }
    if ([429, 529].includes(response.status) && attempt === 0) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter && !/^\d+(?:\.\d+)?$/.test(retryAfter)
        ? (Date.parse(retryAfter) - Date.now()) / 1000 : Number(retryAfter);
      await response.body?.cancel();
      // 長い待機は勝手に短縮して再試行せず、呼び出しを停止する。
      if (Number.isFinite(seconds) && seconds > 5) throw new TypeSafeRequestError("RATE_LIMITED");
      await sleep(Number.isFinite(seconds) && seconds > 0 ? Math.max(1000, seconds * 1000) : 1000);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new TypeSafeRequestError(response.status === 401 ? "AUTH_FAILED" : [429, 529].includes(response.status) ? "RATE_LIMITED" : "API_FAILED");
    }
    try {
      return topicResponseSchema.parse(await response.json());
    } catch {
      throw new TypeSafeRequestError("INVALID_RESPONSE");
    }
  }
  throw new TypeSafeRequestError("API_FAILED");
}

export function safeFailureMessage(error) {
  const messages = {
    KEY_MISSING: "TYPESAFE_API_KEYが未設定です。キーはチャットやファイルに書かず、実行時の環境変数に設定してください。",
    NETWORK_OR_TIMEOUT: "通信に失敗したか、時間切れになりました。応答本文・ヘッダーは記録していません。",
    AUTH_FAILED: "TypeSafeの認証に失敗しました。キーの値を表示せず設定を確認してください。",
    RATE_LIMITED: "TypeSafeの混雑・利用制限により停止しました。時間を置いて再実行してください。",
    API_FAILED: "TypeSafe APIが正常応答を返しませんでした。応答本文は記録していません。",
    INVALID_RESPONSE: "TypeSafeの応答が期待する型・質問ID・モデル版と一致しません。候補には保存していません。",
  };
  return error instanceof TypeSafeRequestError && Object.hasOwn(messages, error.message) ? messages[error.message] : "処理を停止しました。入力データ・実行オプション・ファイルの整合性を確認してください。詳細な例外は秘密情報保護のため出力していません。";
}
