"use client";

import { useMemo, useState } from "react";
import styles from "../gians.module.css";

export type VotePreview = { id: string; name: string; faction: string; raw: string; label: string; confirmed: boolean; needsCorrection: boolean };

const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");

export default function VoteExplorer({ rows }: { rows: VotePreview[] }) {
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("");
  const factions = [...new Set(rows.map((row) => row.faction))];
  const visible = useMemo(() => rows.filter((row) =>
    (!faction || row.faction === faction) &&
    (!query.trim() || normalized(`${row.name} ${row.faction}`).includes(normalized(query))),
  ), [rows, query, faction]);

  return (
    <>
      <div className={styles.voteSearch} role="search" aria-label="議員別賛否候補を探す">
        <div><label htmlFor="member-query">議員名で探す</label><input id="member-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="氏名を入力" /></div>
        <div><label htmlFor="faction-filter">PDFに記された会派</label><select id="faction-filter" value={faction} onChange={(event) => setFaction(event.target.value)}><option value="">すべて</option>{factions.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      </div>
      <p className={styles.voteCount} role="status" aria-live="polite">機械抽出候補{rows.length}件中{visible.length}件を表示。表示中、人による確認記録あり{visible.filter((row) => row.confirmed).length}件。</p>
      {visible.length ? <ul className={styles.voteList}>
        {visible.map((row) => <li key={row.id} className={styles.voteCard}>
          <h3>{row.name}</h3>
          <p>採決時点の会派（候補）：{row.faction}</p>
          <p>PDF原記号：<strong>{row.raw}</strong></p>
          <p>整理した賛否：<strong>{row.label}</strong></p>
          <p className={styles.voteStatus}>{row.needsCorrection ? "原PDFとの相違あり・要修正（賛否候補は確定していません）" : row.confirmed ? "原PDFとの人による照合記録あり（会派見出しは別途確認）" : "公式PDFからの機械抽出・人による確認前"}</p>
        </li>)}
      </ul> : <p className={styles.empty}>該当する議員はありません。氏名や会派の条件を変えてください。</p>}
    </>
  );
}
