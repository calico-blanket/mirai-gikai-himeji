"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./gians.module.css";
import { matchesTopicFilter } from "../../lib/topic-filter";
import { billFilterQuery, readBillFilters } from "../../lib/bill-search";
import { AudienceContent } from "../ReaderMode";
import EasyText from "../EasyText";

export type BillPreview = {
  id: string;
  number: string;
  title: string;
  explanation: string | null;
  explanationReviewed: boolean;
  childExplanation: string | null;
  childExplanationReviewed: boolean;
  summary: string | null;
  result: string;
  kind: string;
  reviewStatus: "verified" | "unreviewed" | "needs_correction";
  topicState: "not_generated" | "candidate" | "withheld";
  topics: { id: string; label: string }[];
  topicReviewed: boolean;
};

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja-JP");

export default function BillExplorer({ items }: { items: BillPreview[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [result, setResult] = useState("");
  const [topic, setTopic] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restore = () => { const state = readBillFilters(window.location.search); setQuery(state.query); setKind(state.kind); setResult(state.result); setTopic(state.topic); setReady(true); };
    restore(); window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore);
  }, []);
  const filterQuery = billFilterQuery({ query, kind, result, topic });
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(window.history.state, "", `/gians${filterQuery ? `?${filterQuery}` : ""}${window.location.hash}`);
  }, [ready, filterQuery]);
  const topicOptions = [...new Map(items.flatMap((item) => item.topics).map((entry) => [entry.id, entry])).values()];
  const results = [...new Set(items.map((item) => item.result))];
  const visible = useMemo(() => {
    const term = normalized(query.trim());
    return items.filter((item) =>
      (!kind || item.kind === kind) &&
      (!result || item.result === result) &&
      matchesTopicFilter(item, topic) &&
      (!term || normalized([item.number, item.title, item.summary ?? "", item.explanation ?? "", item.childExplanation ?? ""].join(" ")).includes(term)),
    );
  }, [items, query, kind, result, topic]);

  return (
    <>
      <div className={styles.search} role="search" aria-label="議案を探す">
        <div className={styles.searchField}>
          <label htmlFor="bill-query">言葉や議案番号で探す</label>
          <input id="bill-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：予算、子育て、議案第135号" />
        </div>
        <div className={styles.selectField}>
          <label htmlFor="bill-kind">種類</label>
          <select id="bill-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">すべて</option>
            <option value="議案">議案</option>
            <option value="諮問">諮問</option>
            <option value="議員提出議案">議員提出議案</option>
          </select>
        </div>
        <div className={styles.selectField}>
          <label htmlFor="bill-result">議決結果</label>
          <select id="bill-result" value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="">すべて</option>
            {results.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.topicFilter}>
        <label htmlFor="bill-topic">分野で探す（サービス独自の整理）</label>
        <select id="bill-topic" value={topic} onChange={(event) => setTopic(event.target.value)} aria-describedby="topic-help">
          <option value="">すべて</option>
          {topicOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          <option value="__not_generated">分類候補が未作成</option>
          <option value="__withheld">分類を保留</option>
        </select>
        <p id="topic-help" className={styles.documentHint}>市の公式分類ではありません。人による確認前のAI候補を含みます。各議案に確認状態を表示します。候補がない議案も、言葉や議案番号で探せます。</p>
      </div>
      <p className={styles.resultCount} role="status" aria-live="polite">{items.length}件中{visible.length}件を表示</p>
      {visible.length === 0 ? (
        <div className={styles.empty}><p>該当する議案はありません。言葉や絞り込みを変えてお試しください。</p><button type="button" onClick={() => { setQuery(""); setKind(""); setResult(""); setTopic(""); }}>条件を消す</button></div>
      ) : (
        <ul className={styles.cards}>
          {visible.map((item) => <li key={item.id} className={styles.card}>
            <div className={styles.cardTop}><span className={styles.number}>{item.number}</span><span className={styles.resultBadge}>結果：{item.result}</span></div>
            <h2><Link href={`/gians/${item.id}${filterQuery ? `?list=${encodeURIComponent(filterQuery)}` : ""}`}>{item.title}</Link></h2>
            <AudienceContent audience="adult">{item.explanation && <p className={styles.cardExplanation}><span className={styles.cardExplanationLabel}>{item.explanationReviewed ? "要点（人による確認記録あり）" : "要点（AI作成・人の確認前）"}</span>{item.explanation}</p>}</AudienceContent>
            <AudienceContent audience="child">{item.childExplanation && <p className={styles.cardExplanation}><span className={styles.cardExplanationLabel}>{item.childExplanationReviewed ? "小学生向け（人による確認記録あり）" : "小学生向け（AI作成・人の確認前）"}</span><EasyText text={item.childExplanation} /></p>}</AudienceContent>
            {item.summary && <p className={styles.excerpt}><span>公式概要</span>{item.summary}</p>}
            <p className={styles.cardMeta}>{item.topicState === "candidate" ? `${item.topicReviewed ? "分野（人の判断記録あり）" : "AI分野候補（未確認）"}：${item.topics.map((entry) => entry.label).join("、")}` : item.topicState === "withheld" ? `分野：分類を保留（${item.topicReviewed ? "人の判断記録あり" : "人による確認前"}）` : "分野：分類候補は未作成"}</p>
            <p className={styles.cardMeta}>姫路市公式HTMLから掲載 · {item.reviewStatus === "verified" ? "原文を目視照合済み" : item.reviewStatus === "needs_correction" ? "修正が必要" : "人による確認前"}</p>
          </li>)}
        </ul>
      )}
    </>
  );
}
