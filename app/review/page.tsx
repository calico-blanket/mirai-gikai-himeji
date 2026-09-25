import type { Metadata } from "next";
import Link from "next/link";
import { council, officialSource } from "../../lib/data/council";
import { pdfLocations } from "../../lib/data/pdf-locations";
import { pdfSource, voteCandidates } from "../../lib/data/vote-candidates";
import { confirmedVoteIds, correctionVoteIds, humanReviews } from "../../lib/data/human-review-data";
import styles from "./review.module.css";
import { discussions } from "../../lib/data/discussions";
import { discussionKindLabel } from "../../lib/data/discussion-validation";
import { topicCandidates, topicsForId, topicReviews } from "../../lib/data/topics";
import { topicDefinitions, topicView } from "../../lib/data/topic-classification";
import { topicCandidateDigest } from "../../lib/data/topic-reviews";
import TopicReviewForm from "./TopicReviewForm";
import ExplanationReview from "./ExplanationReview";
import ContentReviewSection from "./ContentReviewSection";
import { contentReviews } from "../../lib/data/content-review-data";
import { checkVoteConsistency } from "../../lib/data/vote-consistency";

export const metadata: Metadata = { title: "原資料との確認箇所 | 姫路の議会を知る" };

const priorityIds = [
  "bill-136", "bill-145", "bill-164", "bill-165", "bill-166", "member-bill-7",
  "bill-149", "bill-142", "inquiry-5", "bill-153", "inquiry-10",
];

const priority = priorityIds.map((id) => {
  const item = council.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`確認候補の議案が見つかりません: ${id}`);
  return item;
});

export default function ReviewPage() {
  const verifiedItems = council.items.filter((item) => item.reviewStatus === "verified");
  const pendingItems = council.items.filter((item) => item.reviewStatus !== "verified");
  const pendingVotes = voteCandidates.votes.filter((vote) => !confirmedVoteIds.has(vote.id));
  const reviewedHeaders = new Set(humanReviews.filter((record) => record.kind === "headers" && record.decision === "verified").flatMap((record) => Array.from({ length: record.columnEnd - record.columnStart + 1 }, (_, index) => record.columnStart + index)));
  const voteConsistency = checkVoteConsistency(council.items, voteCandidates.votes);
  const inconsistentVotes = voteConsistency.filter((row) => !row.consistent);
  const splitVotes = voteConsistency.filter((row) => row.consistent && row.againstCount > 0);

  return (
    <article className={styles.page}>
      <nav aria-label="パンくずリスト" className={styles.breadcrumb}><Link href="/">トップ</Link><span aria-hidden="true"> / </span>原資料との確認箇所</nav>
      <p className={styles.kicker}>令和7年第4回定例会 · 過去の会期</p>
      <h1>原資料との確認箇所</h1>
      <p className={styles.lead}>このページは確認作業の道案内です。確認状態は保存済みデータから表示しています。ここでリンクを開いても「確認済み」には変わりません。</p>

      <section className={styles.summary} aria-labelledby="summary-heading">
        <h2 id="summary-heading">現在の確認状況</h2>
        <ul>
          <li>議案：{council.items.length}件のうち、人が原文を確認した記録は{verifiedItems.length}件（{verifiedItems.map((item) => item.officialNumber.raw).join("、") || "なし"}）。残り{pendingItems.length}件は確認前。</li>
          <li>議員別賛否：{voteCandidates.votes.length}件のうち{confirmedVoteIds.size}件に有効な目視確認記録。残り{pendingVotes.length}件は未確認または要修正です。</li>
          <li>原PDFとの相違を記録した票：{correctionVoteIds.size}件。修正・再照合まで確認済みにはしません。</li>
          <li>PDF見出しの議員名・会派表記：45列のうち{reviewedHeaders.size}列に確認記録。採決日ごとの所属変更は別途確認が必要です。</li>
          <li>本会議録：発言等{discussions.speechCount}記録を取得（議長進行・出席者一覧を含む）。51案件への{discussions.rows.length}件の対応候補があります。有効な人の判断記録は{[...contentReviews.active.values()].filter((row) => row.kind === "discussion").length}件です。</li>
        </ul>
        <p>公式HTMLとの機械的な全件照合は52件一致しています。これは人による確認とは別の記録です。対象を特定できない過去の目視確認は、個別行の確認済み記録に反映していません。</p>
      </section>

      <ExplanationReview />
      <ContentReviewSection />
      <section className={styles.section} aria-labelledby="topic-review-heading">
        <h2 id="topic-review-heading">分野分類の確認</h2>
        <p>現在の原文・候補に対応する人の判断記録：{topicReviews.active.size}件（保留を含む）。資料更新による再確認待ち：{topicReviews.stale.size}件。</p>
        <p>{council.items.length}案件のうち、AI判定を保存した候補は{topicCandidates.size}件です。残り{council.items.length - topicCandidates.size}件は未作成です。分類の判定値が高い場合も、人の確認済みにはしていません。</p>
        {topicCandidates.size === 0 ? <p>現在は分類候補がありません。結果を生成した後、この欄から分類と入力原文を比較できます。</p> : <>
          <p>分類保留の案件、複数の分野にまたがる案件、複数議案の提案説明を使った案件を先に確認してください。モデルの判定値だけで確認対象から除外しません。</p>
          <ul className={styles.list}>{council.items.filter((item) => topicCandidates.has(item.id)).map((item) => {
            const view = topicsForId(item.id);
            return <li key={item.id}><Link href={`/gians/${item.id}#topics-heading`}>{item.officialNumber.raw}の分野と入力原文を見る</Link><span>{view.state === "withheld" ? "分類保留" : view.topics.map((topic) => topic.label).join("、")} · {view.review ? "人の判断記録あり" : "人による確認前"}</span></li>;
          })}</ul>
          <TopicReviewForm definitions={topicDefinitions} entries={[...topicCandidates.values()].map((record) => ({ record, digest: topicCandidateDigest(record), supersedes: topicReviews.latest.get(record.itemId)?.id ?? null, proposedIds: topicView(record).topics.map((topic) => topic.id), currentReview: topicReviews.active.get(record.itemId), stale: topicReviews.stale.has(record.itemId) }))} />
        </>}
      </section>

      <section className={styles.section} aria-labelledby="discussion-review-heading">
        <h2 id="discussion-review-heading">会議録は、まず対応に注意が必要な箇所から</h2>
        <p>原文抜粋・発言ID・出典の版は機械検証しています。人には、文章が一致するかだけでなく「この議案への説明や答弁として適切か」の判断をお願いします。以下の確認を済ませても、ほかの発言や賛否を一括で確認済みにはしません。</p>
        <ul className={styles.list}>
          <li><Link href="/gians/bill-135#speech-202111">第135号：大前観光経済局長の答弁</Link><span>杉本議員の「初めに」と答弁の「1項目め」の対応。詳細内の「結び付けた根拠」から質問・議長発言も比較できます。</span></li>
          <li><Link href="/gians/bill-163#speech-202071">第163号：過年度の議案番号を含む提案説明</Link><span>文中の令和6年・第172号を、今回の第172号の説明には対応付けていません。</span></li>
          <li><Link href="/gians/bill-151#speech-202071">第151〜153号：複数議案の一括説明</Link><span>同じ段落を共有しています。第155〜158号、第161〜162号、諮問第1〜4号・第5〜12号も同様です。</span></li>
          <li><Link href="/gians/bill-154#speech-202388">第154号：土地取得に関する答弁</Link><span>質問番号を直接述べる答弁の例。前後を含む公式会議録と比較してください。</span></li>
          <li><Link href="/gians/member-bill-7#discussion-heading">議員提出議案第7号：対応未特定</Link><span>今回の番号による抽出では発言を特定できていません。</span></li>
        </ul>
        <details>
          <summary>全{discussions.rows.length}件の対応候補と公式原文へのリンク</summary>
          <ul className={styles.list}>{discussions.rows.map((row) => <li key={row.id}>
            <Link href={`/gians/${row.itemId}#speech-${row.speechId}`}>{council.items.find((item) => item.id === row.itemId)?.officialNumber.raw}：{discussionKindLabel[row.kind]}／{row.speech.NAME}</Link>
            <a href={row.url}>{row.source.meetingDate}の公式発言と比べる</a>
            <span>機械による対応候補・人による確認前</span>
          </li>)}</ul>
        </details>
      </section>

      <section className={styles.section} aria-labelledby="records-heading">
        <h2 id="records-heading">確認記録の残し方</h2>
        <p>PDFの原本と候補を照合した範囲だけ、確認者・確認日時・ページ・行・列を記録します。<code>npm run review:prepare</code> で、見出し1組と各ページの票4組の作業用一覧を作れます。全セルを一括で照合できない場合は、行・列の範囲を狭めて記録してください。</p>
        <ol>
          <li><a href={pdfSource.url}>姫路市公式PDF</a>と照合用CSVを開き、指定範囲の原記号と議員名・会派見出しを照らし合わせます。</li>
          <li>一致した範囲だけ、作業用一覧から <code>reviewInstructions</code> を除き、確認者・日時・判定を入力して <code>data/candidates/himeji-2025-4-human-reviews.json</code> に追加します。相違があれば <code>needs_correction</code> とし、内容を <code>note</code> に残します。</li>
          <li><code>npm run test:data</code> と <code>npm run build</code> で記録を検証します。原PDFや候補値が変わった記録、重複範囲、不正な行列は受け付けません。</li>
        </ol>
        <p>作業用一覧の未入力欄を埋めただけでは目視確認にはなりません。議案第135号のHTML確認記録は従来どおり保持し、PDFの票には流用しません。</p>
      </section>

      <section className={styles.section} aria-labelledby="how-heading">
        <h2 id="how-heading">見比べ方</h2>
        <ol>
          <li><a href={officialSource.url}>姫路市公式の議案・審議結果HTML</a>で議案番号を探し、<Link href="/gians">このサイトの議案詳細</Link>にある「公式に掲載された内容」の4項目と見比べます。「公式概要に記載なし」とある場合は、公式の件名セルに概要の角括弧がないか確認します。</li>
          <li>各議案詳細のPDFページ・行を手掛かりに<a href={pdfSource.url}>公式の採決結果PDF</a>を開き、議員名・会派見出し・原記号を見比べます。画面の賛否は確認が終わるまで機械抽出候補です。</li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="vote-priority-heading">
        <h2 id="vote-priority-heading">議員別賛否は、まずどこから見るか</h2>
        <p>45人×52議案＝{voteCandidates.votes.length}件を一度に確認するのは大変です。ここでは、賛成・反対の集計を議決結果と機械的に突き合わせた結果だけを手掛かりに、見る順番の参考を示します。一致していることは確認済みを意味しません。個々の議員の賛否は、この集計とは別に原PDFとの照合が必要です。</p>
        {inconsistentVotes.length > 0 && <>
          <p><strong>集計が議決結果と一致しない{inconsistentVotes.length}件（最優先）</strong></p>
          <ul className={styles.list}>{inconsistentVotes.map((row) => {
            const item = council.items.find((entry) => entry.id === row.itemId)!;
            const position = pdfLocations.get(row.itemId)!;
            return <li key={row.itemId}><Link href={`/gians/${row.itemId}`}>{item.officialNumber.raw}の詳細</Link><span>議決：{item.result.raw} ／ 候補の賛成{row.forCount}・反対{row.againstCount} ／ PDF {position.page}ページ・{position.row}行</span></li>;
          })}</ul>
        </>}
        <p><strong>反対票を含む{splitVotes.length}件（次に見てほしい）</strong></p>
        <p>残り{52 - splitVotes.length - inconsistentVotes.length}件は候補上の反対票がゼロです。反対がないことは全会一致を意味せず、未取得・不明の記号を含む場合があります。</p>
        <ul className={styles.list}>{splitVotes.map((row) => {
          const item = council.items.find((entry) => entry.id === row.itemId)!;
          const position = pdfLocations.get(row.itemId)!;
          return <li key={row.itemId}><Link href={`/gians/${row.itemId}`}>{item.officialNumber.raw}の詳細</Link><span>議決：{item.result.raw} ／ 候補の賛成{row.forCount}・反対{row.againstCount} ／ PDF {position.page}ページ・{position.row}行</span></li>;
        })}</ul>
      </section>

      <section className={styles.section} aria-labelledby="priority-heading">
        <h2 id="priority-heading">先に見てほしい11件</h2>
        <p>表記が特殊な6件と、固定した無作為抽出の5件です。確認済みという意味ではありません。</p>
        <ul className={styles.list}>
          {priority.map((item) => {
            const position = pdfLocations.get(item.id)!;
            return <li key={item.id}><Link href={`/gians/${item.id}`}>{item.officialNumber.raw}の詳細</Link><span>PDF {position.page}ページ・{position.row}行／人による確認前</span></li>;
          })}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="all-heading">
        <h2 id="all-heading">確認前の全{pendingItems.length}件</h2>
        <p>各行から議案の原文表示とPDF上の位置へ進めます。PDFのページ指定が開けない閲覧環境では、PDFを開いて記載のページへ移動してください。</p>
        <ul className={styles.list}>
          {pendingItems.map((item) => {
            const position = pdfLocations.get(item.id)!;
            return <li key={item.id}><Link href={`/gians/${item.id}`}>{item.officialNumber.raw}の詳細</Link><a href={`${pdfSource.url}#page=${position.page}`}>公式PDF {position.page}ページ・{position.row}行</a></li>;
          })}
        </ul>
      </section>
    </article>
  );
}
