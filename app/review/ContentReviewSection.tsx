import { council } from "../../lib/data/council";
import { contentTargets, contentReviews } from "../../lib/data/content-review-data";
import { contentDigest } from "../../lib/data/content-reviews";
import { explanationEvidence, explanationReviewReasons } from "../../lib/data/explanation-validation";
import { discussionKindLabel } from "../../lib/data/discussion-validation";
import ContentReviewWorkbench from "./ContentReviewWorkbench";
import type { ContentReviewEntry } from "./ContentReviewWorkbench";
import styles from "./review.module.css";

export default function ContentReviewSection() {
  const entries: ContentReviewEntry[] = [];
  for (const [kind, records] of [["explanation", contentTargets.explanations], ["child_explanation", contentTargets.childExplanations]] as const) for (const record of records.values()) {
    const key = `${kind}:${record.itemId}`, item = council.items.find((item) => item.id === record.itemId)!;
    entries.push({ kind, targetId: record.itemId, label: `${item.officialNumber.raw}：${item.title.raw}（${kind === "child_explanation" ? "小学生向け" : "大人向け"}）`, digest: contentDigest(record),
      supersedes: contentReviews.latest.get(key)?.id ?? null, current: contentReviews.active.get(key), stale: contentReviews.stale.has(key),
      text: record.statements.map((row) => row.text), statements: record.statements, hints: explanationReviewReasons(record),
      sources: (["title", "officialSummary", "proposal"] as const).flatMap((id) => { const evidence = explanationEvidence(record.input, id); return evidence ? [{ id, label: evidence.label, raw: evidence.raw, url: evidence.sourceUrl, retrievedAt: evidence.retrievedAt }] : []; }),
    });
  }
  for (const record of contentTargets.discussions.values()) {
    const key = `discussion:${record.id}`, item = council.items.find((item) => item.id === record.itemId)!;
    entries.push({ kind: "discussion", targetId: record.id, label: `${item.officialNumber.raw}：${discussionKindLabel[record.kind]}／${record.speech.NAME}／${record.source.meetingDate}`, digest: contentDigest(record),
      supersedes: contentReviews.latest.get(key)?.id ?? null, current: contentReviews.active.get(key), stale: contentReviews.stale.has(key), text: [record.excerptRaw],
      hints: ["番号の一致だけでなく、この議案についての発言かを前後の文脈で確認してください。", ...(record.method === "contextual_answer" ? ["質問の項目番号による対応です。下の根拠発言も比較してください。"] : [])],
      sources: [{ id: "speech", label: "会議録の該当原文（前後は公式リンク先で確認）", raw: record.excerptRaw, url: record.url, retrievedAt: record.source.retrievedAt }, ...record.evidence.map((evidence, index) => ({ id: `evidence-${index}`, label: `対応の根拠${index + 1}`, raw: evidence.raw, url: `${record.source.url}&HUID=${evidence.speechId}`, retrievedAt: record.source.retrievedAt }))],
    });
  }
  return <section className={styles.section} aria-labelledby="content-review-heading">
    <h2 id="content-review-heading">説明・議論の確認と訂正</h2>
    <p>有効な判断記録：{contentReviews.active.size}件。対象更新による再確認待ち：{contentReviews.stale.size}件。原文を見比べたことと、意味・対応を確認したことを分けて記録します。</p>
    <ContentReviewWorkbench entries={entries} />
  </section>;
}
