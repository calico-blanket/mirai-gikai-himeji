import { formatRetrievedAt } from "../../../lib/data/council";
import { discussionsForId } from "../../../lib/data/discussions";
import { discussionKindLabel } from "../../../lib/data/discussion-validation";
import styles from "../gians.module.css";
import { contentReviews } from "../../../lib/data/content-review-data";
import { contentDecisionLabel } from "../../../lib/data/content-review-schema";
import { committeePagesForId } from "../../../lib/data/committee-pages";

export default function DiscussionList({ itemId }: { itemId: string }) {
  const candidates = discussionsForId(itemId);
  const rows = candidates.filter((row) => !["rejected", "withheld"].includes(contentReviews.active.get(`discussion:${row.id}`)?.decision ?? ""));
  const confirmed = rows.filter((row) => contentReviews.active.get(`discussion:${row.id}`)?.decision === "confirmed").length;
  const committeePages = committeePagesForId(itemId);
  return <>
    <div className={styles.notice} role="note">
      <strong>会議録と議案の対応は、発言ごとに確認状態を表示しています</strong>
      <p>本会議5日分から{candidates.length}件の対応候補を抽出し、{rows.length}件を表示しています。表示中のうち人による対応確認の記録は{confirmed}件です。見出しと分類はこのサービスによる整理、引用部分は公式会議録の原文です。発言者の見解を市や当サービスの判断として示すものではありません。</p>
      <p>委員会の質疑本文や、番号を述べずに続く質疑は網羅していません。掲載がないことは「議論がなかった」という意味ではありません。</p>
    </div>
    {committeePages.length > 0 && <div className={styles.notice} role="note">
      <strong>委員会PDFで議案番号が見つかったページ（機械抽出・人による確認前）</strong>
      <p>この議案番号の文字列があるページへの参照候補です。質疑の有無や内容、議案との対応を確認したものではありません。</p>
      <ul>{committeePages.map((row) => <li key={`${row.file}-${row.page}`}><a href={row.url}>{row.label}：公式PDF {row.page}ページ目 <span aria-hidden="true">↗</span></a></li>)}</ul>
    </div>}
    {rows.length > 0 && <nav className={styles.onThisPage} aria-label="議論の種類から原文へ進む">{Object.entries(discussionKindLabel).map(([kind, label]) => {
      const matches = rows.filter((row) => row.kind === kind);
      return matches.length ? <a key={kind} href={`#speech-${matches[0].speechId}`}>{label}（対応候補{matches.length}件）</a> : null;
    })}</nav>}
    {candidates.length > rows.length && <p>確認作業で保留・誤対応と記録された{candidates.length - rows.length}件の表示を止めています。履歴は確認記録に残しています。</p>}
    {rows.length === 0 ? <p>{candidates.length ? "現在表示できる発言の対応はありません。" : "この議案に対応する発言本文は、今回の抽出では特定できていません。"}</p> :
      <ol className={styles.discussionList}>{rows.map((row) => <li key={row.id} className={styles.discussionCard} id={`speech-${row.speechId}`}>
        <p className={styles.sectionLabel}>{row.source.meetingDate} · {discussionKindLabel[row.kind]}（サービスによる分類）</p>
        <h3>{row.speech.NAME} <span className={styles.documentHint}>／原資料の役職：{row.speech.YAKU}</span></h3>
        <p className={styles.documentHint}>{row.method === "proposal_block" ? "提案説明の該当段落。複数案件をまとめた説明を含む場合があります。" : row.method === "contextual_answer" ? "質問の項目番号と議長の指名を根拠にした答弁の対応候補です。" : "この議案番号が明記された段落の抜粋です。途中の段落を省略している場合があります。"}</p>
        <details className={styles.transcript} open={row.kind === "proposal"}>
          <summary>{row.kind === "proposal" ? "提案理由の原文を読む" : "関連箇所の原文を読む"}</summary>
          <blockquote cite={row.url}>{row.excerptRaw}</blockquote>
        </details>
        {row.kind !== "proposal" && <details className={styles.transcript}>
          <summary>この発言全体を読む（ほかの話題を含む場合があります）</summary>
          <blockquote cite={row.url}>{row.speech.HTGN}</blockquote>
        </details>}
        {row.evidence.length > 0 && <details className={styles.transcript}>
          <summary>質問と答弁を結び付けた根拠を確かめる</summary>
          {row.evidence.map((evidence) => <div key={`${evidence.speechId}-${evidence.paragraphIndex}`}><blockquote>{evidence.raw}</blockquote><a href={`${row.source.url}&HUID=${evidence.speechId}`}>根拠の発言を公式会議録で開く</a></div>)}
        </details>}
        <p className={styles.documentHint}><a href={row.url}>この発言を公式会議録で確認する ↗</a><br />取得：{formatRetrievedAt(row.source.retrievedAt)} · {contentReviews.active.get(`discussion:${row.id}`) ? contentDecisionLabel[contentReviews.active.get(`discussion:${row.id}`)!.decision] : contentReviews.stale.has(`discussion:${row.id}`) ? "原資料の更新により再確認待ち" : "人による確認前"}</p>
        {contentReviews.active.get(`discussion:${row.id}`) && <p className={styles.documentHint}>確認者：{contentReviews.active.get(`discussion:${row.id}`)!.reviewer} · {formatRetrievedAt(contentReviews.active.get(`discussion:${row.id}`)!.reviewedAt)}。理由：{contentReviews.active.get(`discussion:${row.id}`)!.note}</p>}
        <p className={styles.documentHint}>発言位置へ移動しない場合は、{row.source.meetingSubtitleRaw}で「{row.speech.NAME}」や議案番号を探してください。</p>
      </li>)}</ol>}
  </>;
}
