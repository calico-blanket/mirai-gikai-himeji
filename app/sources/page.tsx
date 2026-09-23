import type { Metadata } from "next";
import Link from "next/link";
import { officialSource } from "../../lib/data/council";
import { pdfSource } from "../../lib/data/vote-candidates";
import { discussions } from "../../lib/data/discussions";
import styles from "./sources.module.css";

export const metadata: Metadata = {
  title: "公式資料の読み方 | 姫路の議会を知る",
  description: "令和7年第4回定例会の議案、議論、結果を姫路市の原資料で確かめるための案内です。",
};

const billDocuments = "https://www.city.himeji.lg.jp/shisei/0000030105.html";
const meetingSchedule = "https://www.city.himeji.lg.jp/shisei/0000032092.html";
const questions = "https://himeji.gijiroku.com/g07_Shitsumon.asp";
const minutes = "https://himeji.gijiroku.com/index_s.asp";
const councilBills = "https://himeji.gijiroku.com/g07_giketsu_s.asp?kaigi=122&sflg=2";

export default function SourcesPage() {
  return (
    <article className={styles.page}>
      <nav aria-label="パンくずリスト" className={styles.breadcrumb}><Link href="/">トップ</Link><span aria-hidden="true"> / </span>公式資料の読み方</nav>
      <p className={styles.kicker}>令和7年第4回定例会 · 過去の会期</p>
      <h1>議案・議論・結果の原資料</h1>
      <p className={styles.lead}>姫路市の資料は複数のページとPDFに分かれています。知りたい内容から、対応する公式資料へ進んでください。</p>

      <section className={styles.section} aria-labelledby="bills-heading">
        <p className={styles.step}>01 / 議案を読む</p>
        <h2 id="bills-heading">何が提案されたか</h2>
        <p>このサイトの<Link href="/gians">議案一覧</Link>では、姫路市の公式ページにある議案番号、正式名称、概要、議決結果を読みやすく表示しています。議案詳細には、市長提出の51件について、公式議案書PDFの本文開始ページへのリンクがあります。ページ位置は機械照合・人による確認前です。</p>
        <ul className={styles.links}>
          <li><a href={officialSource.url}>姫路市：令和7年第4回定例会の議案及び審議結果 <span aria-hidden="true">↗</span></a><span>議案番号・件名・概要・結果の一覧</span></li>
          <li><a href={billDocuments}>姫路市：令和7年市議会提出議案 <span aria-hidden="true">↗</span></a><span>同会期の提出議案本文PDFへの入口。PDFごとに議案番号の範囲が記されています</span></li>
          <li><a href={councilBills}>姫路市議会：この会期の議案一覧 <span aria-hidden="true">↗</span></a><span>議案別の公式詳細ページと議決日への入口。会議録の発言とは別の資料です</span></li>
        </ul>
      </section>

      <section id="discussion" className={styles.section} aria-labelledby="discussion-heading">
        <p className={styles.step}>02 / 議論を追う</p>
        <h2 id="discussion-heading">どんな質疑があったか</h2>
        <p>本会議5日分・発言等{discussions.speechCount}記録（議長進行・出席者一覧を含む）を保存し、51案件に{discussions.rows.length}件の対応候補を掲載しています。各議案詳細で、提案理由の説明、質問、答弁、委員長報告、討論の原文を読めます。議案との結び付けと分類は当サービスの機械処理で、人による確認前です。</p>
        <p>委員会そのものの会議録や、議案番号のない続きの質疑は網羅していません。議員提出議案第7号の対応発言は特定できていません。</p>
        <ul className={styles.links}>{discussions.sources.map((source) => <li key={source.recordId}><a href={source.url}>{source.meetingDate}の公式本会議録</a><span>発言等{source.speechCount}記録を取得・人による確認前</span></li>)}</ul>
        <ul className={styles.links}>
          <li><a href={questions}>姫路市議会：質疑・質問一覧 <span aria-hidden="true">↗</span></a><span>会議名を指定して質問内容を探す</span></li>
          <li><a href={minutes}>姫路市議会：会議録検索システム <span aria-hidden="true">↗</span></a><span>本会議・委員会の記録を原文で探す</span></li>
          <li><a href={meetingSchedule}>姫路市：この定例会の会議日程表 <span aria-hidden="true">↗</span></a><span>質疑・委員会・表決の日程を確認する</span></li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="votes-heading">
        <p className={styles.step}>03 / 結果を見る</p>
        <h2 id="votes-heading">どう決まったか</h2>
        <p>議決結果は公式HTMLに掲載されています。議員別の賛否は別の公式PDFにあります。このサイトの議員別表示は機械抽出候補であり、人による原PDFとの照合前です。</p>
        <ul className={styles.links}>
          <li><a href={officialSource.url}>姫路市：議案及び審議結果 <span aria-hidden="true">↗</span></a><span>議案ごとの議決結果</span></li>
          <li><a href={pdfSource.url}>姫路市：議案に対する議員別の賛否一覧（PDF） <span aria-hidden="true">↗</span></a><span>議員名・会派見出し・採決記号の原資料</span></li>
        </ul>
      </section>
      <aside className={styles.note}><h2>このサイトの確認状況</h2><p>議案第135号だけに、人による公式HTML照合の記録があります。ほかの議案やPDF賛否候補は確認前です。</p><Link href="/review">確認状況を見る <span aria-hidden="true">→</span></Link></aside>
    </article>
  );
}
