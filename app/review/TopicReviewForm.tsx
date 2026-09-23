"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { TopicRecord } from "../../lib/data/topic-classification";
import type { TopicReview } from "../../lib/data/topic-reviews";
import styles from "./review.module.css";

type Choice = { id: TopicReview["topicIds"][number]; label: string; definition: string };
export type ReviewableTopic = {
  record: TopicRecord; digest: string; supersedes: string | null;
  proposedIds: string[]; currentReview?: TopicReview; stale: boolean;
};

function ReviewForm({ entry, definitions }: { entry: ReviewableTopic; definitions: readonly Choice[] }) {
  const [decision, setDecision] = useState<TopicReview["decision"] | "">("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const record = entry.record;
  function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reviewer = String(form.get("reviewer") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const topicIds = decision === "confirmed" ? entry.proposedIds : decision === "corrected" ? selected : [];
    if (!decision || !reviewer || !note || !form.has("compared")) { setMessage("確認者・判断理由・公式資料との照合を入力してください。"); return; }
    if (decision !== "withheld" && !topicIds.length) { setMessage("分野を選択してください。判断できない場合は保留にします。"); return; }
    if (decision === "corrected" && JSON.stringify([...topicIds].sort()) === JSON.stringify([...entry.proposedIds].sort())) { setMessage("候補と同じ分野です。「候補を確認」を選ぶか、分野を変更してください。"); return; }
    const review = {
      id: crypto.randomUUID(), itemId: record.itemId, candidateSha256: entry.digest,
      supersedes: entry.supersedes, reviewer, reviewedAt: new Date().toISOString(),
      decision, topicIds, note, comparedWithOfficialSource: true,
    };
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, sessionId: "himeji-2025-4", records: [review] }, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `topic-review-${record.itemId}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage("確認記録のダウンロードを開始しました。まだサイトには反映されていません。下の手順で取り込んでください。");
  }
  return <div className={styles.reviewCard}>
    <h3>{record.input.fields.find((field) => field.field === "officialNumber")?.raw}の分類を照合</h3>
    <p>AI候補：{entry.proposedIds.length ? definitions.filter((topic) => entry.proposedIds.includes(topic.id)).map((topic) => topic.label).join("、") : "分類保留"}（人による確認前の生成結果）</p>
    {entry.currentReview && <p>反映済みの判断：{entry.currentReview.decision === "withheld" ? "保留" : entry.currentReview.decision === "corrected" ? "人が修正" : "候補を確認"}。新たに記録すると、以前の記録を履歴に残して更新します。</p>}
    {entry.stale && <p><strong>原文または候補が更新されたため、以前の確認記録は現在の分類に適用していません。</strong></p>}
    <p>下の原文とリンク先の公式資料で、議案番号・内容・提案説明の対応を確認してください。分類だけの確認であり、賛否などを一括で確認する操作ではありません。</p>
    <div className={styles.sourceText}>
      {record.input.fields.map((field) => <div key={field.field}>
        <h4>{{ officialNumber: "議案番号", title: "正式名称", officialSummary: "公式概要" }[field.field]}</h4>
        <blockquote cite={field.sourceUrl}>{field.raw ?? { not_collected: "未取得", not_in_official_source: "公式資料に記載なし", unknown: "不明", known: "原文なし" }[field.state]}</blockquote>
        <p><a href={field.sourceUrl} target="_blank" rel="noreferrer">公式HTMLを別タブで開く</a> · 取得日時：<time dateTime={field.retrievedAt}>{field.retrievedAt}</time></p>
      </div>)}
      {record.input.proposal ? <div>
        <h4>会議録の提案説明（議案との対応は未確認）</h4>
        <blockquote cite={record.input.proposal.sourceUrl}>{record.input.proposal.raw}</blockquote>
        <p><a href={record.input.proposal.sourceUrl} target="_blank" rel="noreferrer">公式発言を別タブで開く</a> · 取得日時：<time dateTime={record.input.proposal.retrievedAt}>{record.input.proposal.retrievedAt}</time></p>
      </div> : <p>会議録の提案説明との対応は未取得です。</p>}
    </div>
    <details><summary>分野の定義とAI判定値</summary><p>判断材料が足りる：{record.response.answers.evidence_sufficient.noul}。数値は正解率ではありません。</p>
      <ul>{definitions.map((topic) => <li key={topic.id}><strong>{topic.label}（{record.response.answers[topic.id].noul}）</strong>：{topic.definition}</li>)}</ul>
    </details>
    <form id="topic-review-form" onSubmit={download} className={styles.reviewForm} onChange={() => setMessage("")}>
      <fieldset><legend>今回の判断（自動では選択しません）</legend>
        <label><input type="radio" name="decision" value="confirmed" checked={decision === "confirmed"} disabled={!entry.proposedIds.length} required onChange={() => setDecision("confirmed")} />候補の分野を確認</label>
        <label><input type="radio" name="decision" value="corrected" checked={decision === "corrected"} required onChange={() => setDecision("corrected")} />人が分野を指定・修正</label>
        <label><input type="radio" name="decision" value="withheld" checked={decision === "withheld"} required onChange={() => setDecision("withheld")} />判断を保留（分野は表示しない）</label>
      </fieldset>
      {decision === "corrected" && <fieldset><legend>原文に直接の根拠がある分野（複数可）</legend>{definitions.map((topic) => <label key={topic.id}><input type="checkbox" checked={selected.includes(topic.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, topic.id] : selected.filter((id) => id !== topic.id))} />{topic.label}</label>)}</fieldset>}
      <label htmlFor="topic-reviewer">確認者名（反映後、サイトに表示されます。活動名も可）</label>
      <input id="topic-reviewer" name="reviewer" required maxLength={80} autoComplete="off" />
      <label htmlFor="topic-note">根拠・修正理由・保留理由（サイトに表示されます）</label>
      <textarea id="topic-note" name="note" required maxLength={2000} rows={4} placeholder="該当する原文の箇所と、分野を選んだ理由など" />
      <label><input type="checkbox" name="compared" required />この議案の公式資料と照合し、上の判断を自分で行いました</label>
      <p>保存するのはこの1件だけです。入力内容は送信せず、端末にJSONファイルをダウンロードします。</p>
      <button type="submit">この1件の確認記録をダウンロード</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </div>;
}

export default function TopicReviewForm({ entries, definitions }: { entries: ReviewableTopic[]; definitions: readonly Choice[] }) {
  const [itemId, setItemId] = useState(entries[0]?.record.itemId ?? "");
  const entry = entries.find((row) => row.record.itemId === itemId);
  if (!entry) return null;
  return <div className={styles.workbench}>
    <label htmlFor="review-topic-item">照合する議案を選ぶ</label>
    <select id="review-topic-item" value={itemId} onChange={(event) => setItemId(event.target.value)}>
      {entries.map((row) => <option key={row.record.itemId} value={row.record.itemId}>{row.record.input.fields.find((field) => field.field === "officialNumber")?.raw} · {row.stale ? "再確認が必要" : row.currentReview ? "確認記録あり" : "確認前"}</option>)}
    </select>
    <p>議案を切り替えると、まだダウンロードしていない入力は消えます。先に記録を保存してください。</p>
    <ReviewForm key={itemId} entry={entry} definitions={definitions} />
    <details className={styles.importHelp}>
      <summary>ダウンロードした記録をサイトへ反映する</summary>
      <p>プロジェクトの <code>review-import.cmd</code> をダブルクリックして、ダウンロードしたファイルを選んでください。検証してから履歴に追記し、変更前の記録も保存します。複数ファイルは1つずつ取り込めます。</p>
      <p><code>run-local.cmd</code> で開いた画面は、ブラウザを更新すると反映されます。確認記録は人の申告であり、本人認証や電子署名ではありません。元のAI候補、議案原文、議員別賛否は書き換えません。</p>
    </details>
  </div>;
}
