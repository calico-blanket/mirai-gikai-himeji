import { topicCandidates, topicsForId, topicReviews } from "../../../lib/data/topics";
import { formatRetrievedAt } from "../../../lib/data/council";
import { topicDefinitions } from "../../../lib/data/topic-classification";
import styles from "../gians.module.css";

export default function TopicSection({ itemId }: { itemId: string }) {
  const record = topicCandidates.get(itemId);
  const view = topicsForId(itemId);
  return <section className={styles.organized} aria-labelledby="topics-heading">
    <p className={styles.sectionLabel}>このサービスによる整理</p>
    <h2 id="topics-heading">暮らしに関わる分野</h2>
    {!record ? <p>分野の分類候補はまだ作成していません。議案名や原文から内容をご確認ください。</p> : <>
      <p><strong>{view.review ? view.review.decision === "withheld" ? "人の判断で分類を保留" : view.review.decision === "corrected" ? "人が分野を指定・修正" : "分類候補に人の確認記録あり" : "AIによる分野の候補・人による確認前"}</strong></p>
      <p>市の公式分類ではありません。複数の分野にまたがる場合があります。</p>
      {view.sourceIssue && <p>分類に使用した会議録と議案の対応に修正の指摘があるため、分野の表示を保留しています。</p>}
      {topicReviews.stale.has(itemId) && <p>原文または候補が更新されたため、以前の分類確認は再確認待ちです。</p>}
      {view.review && <div><p>確認者：{view.review.reviewer} · 確認日時：{formatRetrievedAt(view.review.reviewedAt)}</p><p>判断理由：{view.review.note}</p><p>この記録の対象は分野分類だけです。原文・会議録の対応・議員別賛否を確認済みにするものではありません。</p></div>}
      {view.state === "candidate" ? <ul className={styles.topicTags}>{view.topics.map((topic) => <li key={topic.id}>{topic.label}{view.review ? "" : "（候補）"}</li>)}</ul>
        : <p>分類を保留しています。判定が曖昧か、入力資料が不足している可能性があります。該当分野がないと断定するものではありません。</p>}
      <p className={styles.documentHint}>生成：{formatRetrievedAt(record.generatedAt)} · 使用モデル：{record.response.model}</p>
      <details className={styles.transcript}>
        <summary>分類に使った原文と出典を確かめる</summary>
        <p>以下はAIへ渡した資料です。分類の正しさや、原資料のすべてを確認したことを示すものではありません。</p>
        {record.input.fields.map((field) => <div key={field.field}>
          <p><strong>{{ officialNumber: "議案番号", title: "正式名称", officialSummary: "公式概要" }[field.field]}</strong></p>
          <blockquote cite={field.sourceUrl}>{field.raw ?? (field.state === "not_in_official_source" ? "公式資料に記載なし" : "値を取得できていません")}</blockquote>
          <p className={styles.documentHint}><a href={field.sourceUrl}>公式HTML</a> · 取得：{formatRetrievedAt(field.retrievedAt)}</p>
        </div>)}
        {record.input.proposal && <div>
          <p><strong>会議録の提案説明（議案との対応は人による確認前）</strong></p>
          <blockquote cite={record.input.proposal.sourceUrl}>{record.input.proposal.raw}</blockquote>
          <p className={styles.documentHint}><a href={record.input.proposal.sourceUrl}>公式の提案説明</a> · 取得：{formatRetrievedAt(record.input.proposal.retrievedAt)}</p>
        </div>}
      </details>
      <details className={styles.transcript}>
        <summary>AIの判定値を見る</summary>
        <p>値は「この分野に該当する」というモデルの判定値です。正解率や人の確認度ではありません。現在の表示基準は試行用で、分類精度は未評価です。</p>
        <ul><li>判断材料が足りる：{record.response.answers.evidence_sufficient.noul.toFixed(2)}</li>{topicDefinitions.map((topic) => <li key={topic.id}>{topic.label}：{record.response.answers[topic.id].noul.toFixed(2)}</li>)}</ul>
      </details>
    </>}
  </section>;
}
