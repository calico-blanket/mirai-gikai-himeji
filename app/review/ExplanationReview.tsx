import Link from "next/link";
import { council } from "../../lib/data/council";
import { explanations } from "../../lib/data/explanations";
import { explanationReviewReasons } from "../../lib/data/explanation-validation";
import { contentReviews } from "../../lib/data/content-review-data";
import { contentDecisionLabel } from "../../lib/data/content-review-schema";
import styles from "./review.module.css";

export default function ExplanationReview() {
  const rows = council.items.map((item) => ({ item, explanation: explanations.get(item.id)! }));
  const priority = rows.filter(({ explanation }) => explanationReviewReasons(explanation).length > 0);
  function list(selected: typeof rows) {
    return <ul className={styles.explanationReviewList}>{selected.map(({ item, explanation }) => <li key={item.id}>
      <h3><Link href={`/gians/${item.id}#explanation-heading`}>{item.officialNumber.raw}：説明と根拠を見比べる</Link></h3>
      <p>{contentReviews.active.has(`explanation:${item.id}`) ? contentDecisionLabel[contentReviews.active.get(`explanation:${item.id}`)!.decision] : "人による確認前"}。以下は比較用の元の説明案です。</p>
      {explanation.statements.map((statement, index) => <p key={index}>{statement.text}</p>)}
      {explanationReviewReasons(explanation).length > 0 && <ul>{explanationReviewReasons(explanation).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    </li>)}</ul>;
  }
  return <section className={styles.section} aria-labelledby="explanation-review-heading">
    <h2 id="explanation-review-heading">大人向けの説明を原文と見比べる</h2>
    <p>小学生向けの52件は、下の「説明・議論の確認と訂正」で種類を切り替えて確認できます。</p>
    <p>全{explanations.size}件にAI作成の説明案があります。有効な人の判断記録は{[...contentReviews.active.values()].filter((row) => row.kind === "explanation").length}件です。文章ごとに根拠となる公式原文と出典へ進めます。機械検証は、文章の意味や省略の妥当性を保証しません。</p>
    <p>まずは条件・数字・原文の表記などに注意が必要な{priority.length}件を優先表示しています。確認対象を絞るための案内であり、残りを確認済みにする仕組みではありません。分野分類の確認記録も、この説明案の承認には流用しません。</p>
    <details><summary>優先して見比べる{priority.length}件</summary>{list(priority)}</details>
    <details><summary>全{rows.length}件の説明案</summary>{list(rows)}</details>
  </section>;
}
