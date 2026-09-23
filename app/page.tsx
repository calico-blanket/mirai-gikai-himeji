import Image from "next/image";
import Link from "next/link";
import { council, officialSource } from "../lib/data/council";
import { topicsForId } from "../lib/data/topics";
import { topicDefinitions } from "../lib/data/topic-classification";
import styles from "./page.module.css";
import { AudienceContent, ReaderText } from "./ReaderMode";

export default function Home() {
  const views = council.items.map((item) => topicsForId(item.id));
  return (
    <>
      <section className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>姫路の議会を、暮らしの言葉で探す</p>
          <h1 id="page-title">姫路の暮らしに、<br />どんな議論が？</h1>
          <p className={styles.lead}><ReaderText adult="議案の内容、議論への入口、決まった結果を一か所に。気になることから読み始め、必要なときは姫路市の原資料へ進めます。" child="まちのために、どんな案を話し合ったのかな？ 何が決まったのかな？ 気になることからよんで、市が書いたもとの資料も見てみよう。" /></p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/gians">議案を探す <span aria-hidden="true">→</span></Link>
            <Link className={styles.secondaryAction} href="/sources">公式資料の読み方</Link>
          </div>
          <p className={styles.scope}>令和7年第4回定例会の記録を掲載。<strong>過去の1会期を対象とする非公式サービス</strong>です。姫路市の公式サービスではありません。</p>
        </div>
        <figure className={styles.heroVisual}>
          <Image src="/images/himeji-castle-illustration.webp" alt="姫路城と周辺の緑を描いたイメージイラスト" width={1672} height={941} priority sizes="(max-width: 760px) 100vw, 55vw" />
          <figcaption>姫路の風景をイメージした生成イラスト</figcaption>
        </figure>
      </section>
      <AudienceContent audience="child"><section className={styles.childWelcome} aria-labelledby="child-welcome"><h2 id="child-welcome">ひめじのまちの「どうする？」を のぞいてみよう</h2><p>学校のこと、公園のこと、まちのお金のこと。議会（ぎかい）では、どんな案を話し合ったのかな？ 気になることから よんでみよう。</p><p>ここにあるのは、前の議会の記録です。AIの説明は、まだ人がたしかめる前のものです。</p></section></AudienceContent>
      <section className={styles.pathways} aria-labelledby="find-title">
        <div className={styles.sectionHead}><p className={styles.eyebrow}>暮らしの関心から</p><h2 id="find-title">気になる言葉や分野で探す</h2></div>
        <form action="/gians" className={styles.homeSearch} role="search">
          <label htmlFor="home-query">言葉や議案番号</label>
          <div><input id="home-query" name="q" type="search" placeholder="例：子ども、美術館、135" maxLength={200} /><button type="submit">議案を探す</button></div>
        </form>
        <ul className={styles.topicLinks}>{topicDefinitions.map((topic) => {
          const count = views.filter((view) => view.topics.some((entry) => entry.id === topic.id)).length;
          return count > 0 ? <li key={topic.id}><Link href={`/gians?topic=${topic.id}`}>{topic.label}<span>{count}件</span></Link></li> : null;
        })}<li><Link href="/gians?topic=__withheld">分類を保留<span>{views.filter((view) => view.state === "withheld").length}件</span></Link></li></ul>
        <p className={styles.scope}>分野はサービス独自の整理で、人による確認前のAI候補を含みます。複数分野に載る議案があります。分野が決まらない議案も省かず掲載しています。</p>
      </section>
      <section className={styles.pathways} aria-labelledby="pathways-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>どこから読む？</p>
          <h2 id="pathways-title">議案から、議論と結果へ</h2>
          <p>市の複数のページやPDFを行き来せず、まずは知りたい入口を選べます。</p>
        </div>
        <div className={styles.pathwayGrid}>
          <article className={styles.pathway}>
            <span className={styles.step}>01 / 内容</span>
            <h3>何が提案された？</h3>
            <p>公式ページの議案番号、件名、概要を読みやすく並べています。公式概要に記載がない場合も、そのまま示します。</p>
            <Link href="/gians">{council.items.length}件の議案を探す <span aria-hidden="true">→</span></Link>
          </article>
          <article className={styles.pathway}>
            <span className={styles.step}>02 / 議論</span>
            <h3>どんな話が出た？</h3>
            <p>議案詳細に、会議録から抽出した提案説明・質疑・討論などを掲載しています。発言との対応には未確認の候補があり、各発言から公式会議録へ進めます。</p>
            <Link href="/gians">議案ごとの議論を読む <span aria-hidden="true">→</span></Link>
          </article>
          <article className={styles.pathway}>
            <span className={styles.step}>03 / 結果</span>
            <h3>どう決まった？</h3>
            <p>公式HTMLの議決結果と、公式PDFから機械抽出した議員別賛否の候補を分けて表示します。賛否候補は人による確認前です。</p>
            <Link href="/gians">議決結果を見る <span aria-hidden="true">→</span></Link>
          </article>
        </div>
      </section>

      <section className={styles.sourcePanel} aria-labelledby="source-title">
        <div>
          <p className={styles.eyebrow}>一次資料と照らし合わせる</p>
          <h2 id="source-title">元の資料を、いつでも確認できます</h2>
          <p>このサイトは姫路市の資料を読みやすく整理する非公式の入口です。掲載内容には未確認の部分があり、正式な情報は原資料をご覧ください。</p>
        </div>
        <div className={styles.sourceActions}>
          <a href={officialSource.url}>姫路市公式の議案・審議結果 <span aria-hidden="true">↗</span></a>
          <Link href="/sources">資料の一覧と読み方 <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className={styles.status} aria-labelledby="status-title">
        <h2 id="status-title">掲載と確認の状況</h2>
        <p>議案{council.items.length}件を掲載しています。原文との人による照合記録は議案第135号のみです。議員・会派と議員別賛否は公式PDFからの機械抽出候補で、すべて人による確認前です。</p>
        <Link href="/review">確認状況を詳しく見る <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}
