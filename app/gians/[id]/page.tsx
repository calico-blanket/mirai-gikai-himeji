import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { council, formatRetrievedAt, itemById, missingLabel, officialSource } from "../../../lib/data/council";
import { pdfSource, voteLabel, votesForItem } from "../../../lib/data/vote-candidates";
import { pdfLocations } from "../../../lib/data/pdf-locations";
import { billDocumentForId } from "../../../lib/data/bill-document";
import { billPageForId } from "../../../lib/data/bill-pages";
import { councilBillLinkForId } from "../../../lib/data/council-bill-links";
import { questionTopicsForId } from "../../../lib/data/question-topics";
import { confirmedVoteIds, correctionVoteIds } from "../../../lib/data/human-review-data";
import styles from "../gians.module.css";
import VoteExplorer from "./VoteExplorer";
import DiscussionList from "./DiscussionList";
import TopicSection from "./TopicSection";
import ExplanationSection from "./ExplanationSection";
import BillNavigation from "./BillNavigation";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return council.items.map((item) => ({ id: item.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = itemById((await params).id);
  return { title: item ? `${item.officialNumber.raw} | 姫路の議会を知る` : "議案が見つかりません" };
}

export default async function BillDetailPage({ params }: Props) {
  const item = itemById((await params).id);
  if (!item) notFound();
  const voteRows = votesForItem(item.id);
  const confirmedCount = voteRows.filter(({ vote }) => confirmedVoteIds.has(vote.id)).length;
  const pdfLocation = pdfLocations.get(item.id)!;
  const billDocument = billDocumentForId(item.id);
  const billPage = billPageForId(item.id);
  const councilBillLink = councilBillLinkForId(item.id);
  const questionTopics = questionTopicsForId(item.id);
  const position = council.items.findIndex((row) => row.id === item.id);
  const neighbor = (index: number) => { const row = council.items[index]; return row ? { id: row.id, number: row.officialNumber.raw ?? row.id, title: row.title.raw ?? "名称不明" } : null; };

  const fields = [
    { key: "officialNumber", label: "議案番号", value: item.officialNumber },
    { key: "title", label: "正式名称", value: item.title },
    { key: "officialSummary", label: "公式概要", value: item.officialSummary },
    { key: "result", label: "議決結果", value: item.result },
  ] as const;

  return (
    <article className={styles.page}>
      <nav aria-label="パンくずリスト" className={styles.breadcrumb}><Link href="/">トップ</Link><span aria-hidden="true"> / </span><Link href="/gians">議案一覧</Link><span aria-hidden="true"> / </span>{item.officialNumber.raw}</nav>
      <p className={styles.kicker}>令和7年第4回定例会 · 過去の会期</p>
      <p className={styles.number}>{item.officialNumber.raw}</p>
      <h1 className={styles.detailTitle}>{item.title.raw}</h1>
      <ExplanationSection itemId={item.id} />
      <div className={styles.overview}>
        <div>
          <p className={styles.overviewLabel}>姫路市公式HTMLの概要</p>
          <p>{item.officialSummary.state === "known" ? item.officialSummary.raw : missingLabel(item.officialSummary.state)}</p>
        </div>
        <div>
          <p className={styles.overviewLabel}>議決結果</p>
          <p className={styles.overviewResult}>{item.result.state === "known" ? item.result.raw : missingLabel(item.result.state)}</p>
          <p className={styles.overviewSmall}>姫路市公式HTMLの原表記</p>
        </div>
      </div>
      <div className={styles.notice} role="note"><strong>{item.reviewStatus === "verified" ? "公式HTMLとの目視照合済み" : "人による確認前のデータです"}</strong><p>公式HTMLからの取り込み結果です。正式な内容は<a href={officialSource.url}>姫路市の公式ページ</a>をご確認ください。</p></div>
      <nav className={styles.onThisPage} aria-label="この議案の内容"><a href="#explanation-heading">要点</a><a href="#topics-heading">分野</a><a href="#official-heading">公式の原文</a><a href="#document-heading">議案本文</a><a href="#discussion-heading">議論の資料</a><a href="#votes-heading">議員別賛否</a></nav>
      <TopicSection itemId={item.id} />

      <section className={styles.official} aria-labelledby="official-heading">
        <p className={styles.sectionLabel}>姫路市公式HTMLの原文</p>
        <h2 id="official-heading">公式に掲載された内容</h2>
        <dl className={styles.fields}>
          {fields.map(({ key, label, value }) => {
            const evidence = item.fieldEvidence[key];
            const source = council.sources.find((entry) => entry.id === evidence.sourceId);
            return (
              <div key={key} className={styles.field}>
                <dt>{label}</dt>
                <dd className={styles.fieldValue}>{value.state === "known" ? value.raw : missingLabel(value.state)}</dd>
                <dd className={styles.fieldMeta}>
                  出典：<a href={source?.url ?? officialSource.url}>姫路市公式HTML</a><br />
                  取得：{formatRetrievedAt(evidence.retrievedAt)} · 確認状態：{evidence.reviewStatus === "verified" ? "確認済み" : "人による確認前"}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className={styles.organized} aria-labelledby="organized-heading">
        <p className={styles.sectionLabel}>このサービスによる整理</p>
        <h2 id="organized-heading">表示のために整理した情報</h2>
        <p>議案番号は一覧で探しやすいように表記をそろえています。議決結果は公式HTMLの「{item.result.raw}」をそのまま表示しています。「この議案の要点」は当サービスによる未確認の説明案として、公式原文と分けています。</p>
        {item.officialNumber.state === "known" && item.officialNumber.raw !== item.officialNumber.value && <p className={styles.normalized}>整理した番号：{item.officialNumber.value}（公式の表記：{item.officialNumber.raw}）</p>}
        <p>以下の議員別賛否は別の公式PDFからの機械抽出候補です。議決結果から個々の議員の賛否を推測していません。</p>
      </section>
      <section className={styles.discussion} aria-labelledby="document-heading">
        <p className={styles.sectionLabel}>姫路市公式の提出議案書</p>
        <h2 id="document-heading">議案本文を読む</h2>
        {billPage ? <>
          <p><a href={`${billPage.pdfUrl}#page=${billPage.page}`}>この議案の本文が始まるPDF {billPage.page}ページ目を開く <span aria-hidden="true">↗</span></a></p>
          <p className={styles.documentHint}>議案番号と{billPage.matchLevel === "number_and_full_title" ? "正式名称" : "件名の先頭"}による機械照合です。人によるページ確認前です。PDFのページ指定が開けない場合は、PDF内で{billPage.page}ページ目へ移動してください。取得：{formatRetrievedAt(billPage.retrievedAt)}。</p>
        </> : <p>この議案に対応する本文PDFのページは特定できていません。<a href="https://www.city.himeji.lg.jp/shisei/0000032187.html">姫路市の公式議案一覧</a>から確認してください。</p>}
        {billDocument && !billPage && <p><a href={billDocument.url}>この議案を含む提出議案PDFを開く</a></p>}
      </section>
      <section className={styles.discussion} aria-labelledby="discussion-heading">
        <p className={styles.sectionLabel}>議論を読む</p>
        <h2 id="discussion-heading">この議案はどう話し合われた？</h2>
        <DiscussionList itemId={item.id} />
        {questionTopics.length > 0 && <div className={styles.notice} role="note"><strong>公式の質疑・質問一覧に議案番号がある項目</strong>{questionTopics.map((topic) => <p key={`${topic.itemId}-${topic.speakerRaw}`}>{topic.speakerRaw}：{topic.topicRaw}（<a href={topic.sourceUrl}>姫路市議会の質問一覧</a>。一覧からの機械抽出・人による確認前。発言本文や答弁の確認ではありません）</p>)}</div>}
        {questionTopics.length === 0 && <p>公式の質疑・質問一覧から、この議案番号を明記した項目は抽出できていません。質問や審議がなかったという意味ではありません。</p>}
        {councilBillLink && <p><a href={councilBillLink.detailUrl}>姫路市議会のこの議案の詳細を見る <span aria-hidden="true">↗</span></a><span className={styles.documentHint}>（市議会の一覧に記載された「{councilBillLink.resultLineRaw}」。議論の発言へのリンクではありません。機械照合・人による確認前）</span></p>}
        <p><Link href="/sources#discussion">公式の質疑・質問一覧と会議録の探し方を見る <span aria-hidden="true">→</span></Link></p>
        <p><a href="https://www.city.himeji.lg.jp/shisei/0000030105.html">姫路市の提出議案PDF一覧を見る <span aria-hidden="true">↗</span></a></p>
      </section>
      <section className={styles.votes} aria-labelledby="votes-heading">
        <p className={styles.sectionLabel}>公式PDFからの機械抽出候補</p>
        <h2 id="votes-heading">議員別賛否</h2>
        <div className={styles.notice} role="note">
          <strong>公式PDFからの機械抽出候補</strong>
          <p>以下の{voteRows.length}件のうち、人による照合で一致した記録があるのは{confirmedCount}件です。議案本文の確認は賛否の確認を意味しません。<a href={`${pdfSource.url}#page=${pdfLocation.page}`}>姫路市の公式PDFの{pdfLocation.page}ページ目</a>で確認してください。</p>
        </div>
        <p className={styles.voteMeta}>PDF上の位置：{pdfLocation.page}ページ目・上から{pdfLocation.row}番目の議案行（原文「{pdfLocation.pdfNumberRaw}」）。各カードは左からの議員列順です。</p>
        <p className={styles.voteMeta}>出典：<a href={`${pdfSource.url}#page=${pdfLocation.page}`}>姫路市公式の採決結果PDF</a> · 取得：{formatRetrievedAt(pdfSource.retrievedAt)}。現在の会派所属は掲載していません。</p>
        <VoteExplorer rows={voteRows.map(({ vote, member, membership }) => ({
          id: vote.id,
          name: member.name.state === "known" ? member.name.raw : missingLabel(member.name.state),
          faction: membership.factionId.state === "known" ? membership.factionId.raw : missingLabel(membership.factionId.state),
          raw: vote.position.raw ?? missingLabel(vote.position.state),
          label: vote.position.state === "known" ? voteLabel(vote.position.value) : missingLabel(vote.position.state),
          confirmed: confirmedVoteIds.has(vote.id),
          needsCorrection: correctionVoteIds.has(vote.id),
        }))} />
        <p className={styles.voteNote}>原記号の「○」「〇」は賛成、「✕」は反対、「-」は議長の採決不参加として整理した候補です。欠席・退席・除斥・不明・未取得も別の区分として扱い、空欄を賛成とは推測しません。</p>
        <p className={styles.voteNote}><Link href="/members">この会期の議員・会派一覧を見る</Link> · <Link href="/review">原資料との確認箇所を見る</Link></p>
      </section>
      <BillNavigation previous={neighbor(position - 1)} next={neighbor(position + 1)} />
    </article>
  );
}
