import { explanationForId } from "../../../lib/data/explanations";
import { childExplanations } from "../../../lib/data/explanations";
import { AudienceContent, ReaderText } from "../../ReaderMode";
import EasyText from "../../EasyText";
import { explanationEvidence, explanationReviewReasons } from "../../../lib/data/explanation-validation";
import { formatRetrievedAt } from "../../../lib/data/council";
import styles from "../gians.module.css";
import { explanationDisplayForId, contentReviews } from "../../../lib/data/content-review-data";
import { contentDecisionLabel } from "../../../lib/data/content-review-schema";

function ExplanationBody({ itemId, audience }: { itemId: string; audience: "adult" | "child" }) {
  const record = audience === "child" ? childExplanations.get(itemId) : explanationForId(itemId);
  if (!record) return null;
  const view = explanationDisplayForId(itemId, audience)!;
  const reasons = explanationReviewReasons(record);
  return <div>
    <p className={styles.draftLabel}>{view.sourceIssue ? "根拠の対応が保留・要修正のため表示を停止" : view.review ? contentDecisionLabel[view.review.decision] : audience === "child" ? "AIが作った小学生向けの説明案・人による確認前" : "AI作成の説明案・人による確認前"}</p>
    {contentReviews.stale.has(`${audience === "child" ? "child_explanation" : "explanation"}:${itemId}`) && <p>説明または根拠が更新されたため、以前の確認記録は適用していません。</p>}
    {view.review && <p className={styles.documentHint}>確認者：{view.review.reviewer} · {formatRetrievedAt(view.review.reviewedAt)}。理由：{view.review.note}</p>}
    <p className={styles.documentHint}>{audience === "child" ? "前の議会に出された案を、短く説明しています。今の制度や、申しこみの案内ではありません。市が書いた説明ではありません。" : "令和7年第4回定例会に提出された案を短く説明しています。市の公式説明や、現在の制度・受付状況を示すものではありません。"}</p>
    {view.hidden && <p>説明の掲載を止めています。下の公式概要や議案本文から内容をご確認ください。</p>}
    <ol className={styles.explanationPoints}>{view.statements.map((statement, index) => <li key={index}>
      <p>{audience === "child" ? <EasyText text={statement.text} /> : statement.text}</p>
      <details className={styles.transcript} data-explanation-evidence={audience}>
        <summary>{audience === "child" ? "もとの資料と くらべてみる" : "この説明の根拠となる原文を見る"}</summary>
        {statement.evidenceIds.map((id) => {
          const evidence = explanationEvidence(record.input, id)!;
          return <div key={id}><p className={styles.documentHint}>{evidence.label}</p>
            <blockquote cite={evidence.sourceUrl}>{evidence.raw}</blockquote>
            <p className={styles.documentHint}><a href={evidence.sourceUrl}>公式資料で確かめる ↗</a> · 取得：{formatRetrievedAt(evidence.retrievedAt)}</p>
          </div>;
        })}
      </details>
    </li>)}</ol>
    {reasons.length > 0 && <aside className={styles.explanationCaution} aria-label="説明を読む際の注意"><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></aside>}
    <p className={styles.documentHint}>元の説明案の作成：{formatRetrievedAt(record.createdAt)}。確認記録の対象はこの説明だけで、議員別賛否やほかの発言の確認ではありません。</p>
    <p className={styles.explanationLinks}><a href="#document-heading">議案本文を読む</a><a href="#discussion-heading">議論の資料へ</a><a href="#official-heading">公式の概要・結果へ</a></p>
  </div>;
}

export default function ExplanationSection({ itemId }: { itemId: string }) {
  return <section className={styles.explanation} aria-labelledby="explanation-heading">
    <p className={styles.sectionLabel}>このサービスによる整理</p><h2 id="explanation-heading"><ReaderText adult="この議案の要点" child="この案は、どんなこと？" /></h2>
    <AudienceContent audience="adult"><ExplanationBody itemId={itemId} audience="adult" /></AudienceContent>
    <AudienceContent audience="child"><p className={styles.childIntro}>どんな案か、やさしい ことばで よんでみよう。むずかしいところは、大人といっしょに たしかめよう。</p><ExplanationBody itemId={itemId} audience="child" />
      <details className={styles.transcript}><summary>ことばのヒント</summary><dl className={styles.glossary}><dt>議案（ぎあん）</dt><dd>議会で話し合って決めるために出された案。</dd><dt>予算（よさん）</dt><dd>入るお金と、使うお金の計画。</dd><dt>条例（じょうれい）</dt><dd>市などが決める、その地域の決まり。</dd></dl></details>
    </AudienceContent>
  </section>;
}
