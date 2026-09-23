import type { Metadata } from "next";
import Link from "next/link";
import { formatRetrievedAt, missingLabel } from "../../lib/data/council";
import { membersForFaction, pdfSource, voteCandidates } from "../../lib/data/vote-candidates";
import styles from "./members.module.css";

export const metadata: Metadata = {
  title: "議員・会派 | 姫路の議会を知る",
  description: "令和7年第4回定例会の公式採決PDFに載る議員・会派の機械抽出候補。人による確認前です。",
};

export default function MembersPage() {
  const unknownMemberships = voteCandidates.memberships.filter((row) => row.factionId.state !== "known");
  return (
    <div className={styles.page}>
      <nav aria-label="パンくずリスト" className={styles.breadcrumb}><Link href="/">トップ</Link><span aria-hidden="true"> / </span>議員・会派</nav>
      <p className={styles.kicker}>令和7年第4回定例会 · 過去の会期</p>
      <h1>議員・会派</h1>
      <p className={styles.lead}>この会期の採決結果PDFに載る議員名と会派見出しを、PDFの列順で並べています。現在の会派所属は掲載していません。</p>
      <div className={styles.notice} role="note">
        <strong>公式PDFからの機械抽出・人による確認前</strong>
        <p>名前と会派の対応は、原PDFとの目視照合が終わっていません。確定した所属として扱わず、<a href={pdfSource.url}>姫路市の公式PDF</a>で確認してください。</p>
      </div>
      <p className={styles.meta}>掲載候補：議員{voteCandidates.members.length}人・会派{voteCandidates.factions.length}件。PDF取得：{formatRetrievedAt(pdfSource.retrievedAt)}。</p>
      {voteCandidates.factions.map((faction) => {
        const members = membersForFaction(faction.id);
        return (
          <section key={faction.id} className={styles.faction} aria-labelledby={`faction-${faction.id}`}>
            <h2 id={`faction-${faction.id}`}>{faction.name.state === "known" ? faction.name.raw : missingLabel(faction.name.state)} <span className={styles.count}>{members.length}人</span></h2>
            <ul className={styles.members}>
              {members.map((member) => <li key={member.id}>{member.name.state === "known" ? member.name.raw : missingLabel(member.name.state)}</li>)}
            </ul>
          </section>
        );
      })}
      {unknownMemberships.length > 0 && (
        <section className={styles.faction} aria-labelledby="unknown-faction">
          <h2 id="unknown-faction">採決時点の会派が未確認 <span className={styles.count}>{unknownMemberships.length}人</span></h2>
          <ul className={styles.members}>{unknownMemberships.map((row) => {
            const member = voteCandidates.members.find((entry) => entry.id === row.memberId);
            return <li key={row.id}>{member?.name.state === "known" ? member.name.raw : "氏名未確認"}</li>;
          })}</ul>
        </section>
      )}
      <p className={styles.endNote}>この一覧は議員や会派の評価・順位を示すものではありません。<Link href="/gians">議案一覧</Link>から各議案の賛否候補を確認できます。</p>
    </div>
  );
}
