import type { Metadata } from "next";
import Link from "next/link";
import { council, formatRetrievedAt, officialSource } from "../../lib/data/council";
import BillExplorer, { type BillPreview } from "./BillExplorer";
import styles from "./gians.module.css";
import { topicsForId } from "../../lib/data/topics";
import { explanationDisplayForId } from "../../lib/data/content-review-data";

export const metadata: Metadata = {
  title: "議案一覧 | 姫路の議会を知る",
  description: "令和7年第4回定例会の議案と審議結果。姫路市公式HTMLから取得し、議案ごとに確認状態を示しています。",
};

const items: BillPreview[] = council.items.map((item) => ({
  id: item.id,
  number: item.officialNumber.raw ?? "番号不明",
  title: item.title.raw ?? "名称不明",
  explanation: explanationDisplayForId(item.id)?.statements.map((statement) => statement.text).join(" ") || null,
  explanationReviewed: ["confirmed", "corrected"].includes(explanationDisplayForId(item.id)?.review?.decision ?? ""),
  childExplanation: explanationDisplayForId(item.id, "child")?.statements.map((statement) => statement.text).join(" ") || null,
  childExplanationReviewed: ["confirmed", "corrected"].includes(explanationDisplayForId(item.id, "child")?.review?.decision ?? ""),
  summary: item.officialSummary.state === "known" ? item.officialSummary.raw : null,
  result: item.result.raw ?? "結果不明",
  kind: item.id.startsWith("member-bill-") ? "議員提出議案" : item.id.startsWith("inquiry-") ? "諮問" : "議案",
  reviewStatus: item.reviewStatus,
  topicState: topicsForId(item.id).state,
  topics: topicsForId(item.id).topics,
  topicReviewed: Boolean(topicsForId(item.id).review),
}));

export default function BillsPage() {
  return (
    <div className={styles.page}>
      <nav aria-label="パンくずリスト" className={styles.breadcrumb}><Link href="/">トップ</Link><span aria-hidden="true"> / </span>議案一覧</nav>
      <p className={styles.kicker}>令和7年第4回定例会 · 過去の会期</p>
      <h1>議案一覧</h1>
      <p className={styles.lead}>議案番号や気になる言葉から、令和7年第4回定例会の議案を探せます。各議案で内容、結果、原資料を確認できます。</p>
      <div className={styles.notice} role="note">
        <strong>議案ごとに確認状態が異なります</strong>
        <p>公式HTMLから取り込んだ内容を型と参照関係で検証し、原文との目視照合を進めています。各議案の確認状態をご覧ください。正式な内容は<a href={officialSource.url}>姫路市の公式ページ</a>でご確認ください。</p>
      </div>
      <p className={styles.summary}>掲載対象：{council.items.length}件。取得日時：{formatRetrievedAt(officialSource.retrievedAt)}。</p>
      <BillExplorer items={items} />
      <p className={styles.endNote}>各議案の詳細には、公式PDFから機械抽出した議員別賛否の未確認候補を掲載しています。<Link href="/members">議員・会派一覧を見る</Link></p>
    </div>
  );
}
