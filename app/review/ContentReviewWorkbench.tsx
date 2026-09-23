"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { contentReviewSchema, contentReviewFileSchema, contentReviewKey, contentDecisionLabel } from "../../lib/data/content-review-schema";
import type { ContentReview } from "../../lib/data/content-review-schema";
import type { ExplanationRecord } from "../../lib/data/explanation-validation";
import styles from "./review.module.css";

export type ContentReviewEntry = {
  kind: ContentReview["kind"]; targetId: string; label: string; digest: string;
  supersedes: string | null; current?: ContentReview; stale: boolean;
  text: string[]; hints: string[];
  statements?: ExplanationRecord["statements"];
  sources: { id: string; label: string; raw: string; url: string; retrievedAt: string }[];
};

function EntryForm({ entry, reviewer, setReviewer, onStage }: { entry: ContentReviewEntry; reviewer: string; setReviewer: (value: string) => void; onStage: (row: ContentReview) => void }) {
  const [decision, setDecision] = useState("");
  const [replacement, setReplacement] = useState(entry.current && entry.current.kind !== "discussion" && entry.current.replacement ? entry.current.replacement : entry.statements ?? []);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = contentReviewSchema.safeParse({
      id: crypto.randomUUID(), kind: entry.kind, targetId: entry.targetId, candidateSha256: entry.digest,
      supersedes: entry.supersedes, reviewedAt: new Date().toISOString(), reviewer, note: form.get("note"), decision,
      originalTextChecked: form.has("original"), meaningChecked: form.has("meaning"),
      ...(decision === "corrected" ? { replacement } : {}),
    });
    if (!result.success) { setError(result.error.issues.map((issue) => issue.message).join("。")); return; }
    if (decision === "corrected" && JSON.stringify(replacement) === JSON.stringify(entry.statements)) { setError("元の説明と同じです。確認を選ぶか、訂正文を編集してください。"); return; }
    onStage(result.data); setError("");
  }
  return <div className={styles.reviewCard}>
    <h3>{entry.label}</h3>
    {entry.current && <p>反映済み：{contentDecisionLabel[entry.current.decision]}。再記録すると履歴を残して更新します。</p>}
    {entry.stale && <p><strong>対象が更新されたため、以前の確認は再確認待ちです。</strong></p>}
    <div className={styles.comparison}>
      <div><h4>{entry.kind !== "discussion" ? "AI作成の説明案" : "議案に関連すると抽出した発言"}</h4>{entry.text.map((text, index) => <p key={index} className={styles.preserveLines}>{text}</p>)}
        {entry.hints.length > 0 && <ul>{entry.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>}
      </div>
      <div><h4>比較する原資料</h4>{entry.sources.map((source) => <details key={source.id} open={entry.sources.length === 1}>
        <summary>{source.label}</summary><blockquote className={styles.preserveLines} cite={source.url}>{source.raw}</blockquote>
        <p><a href={source.url} target="_blank" rel="noreferrer">公式資料を別タブで開く</a></p><p className={styles.small}>取得：{source.retrievedAt}</p>
      </details>)}</div>
    </div>
    <form id="content-review-form" className={styles.reviewForm} onSubmit={submit}>
      <fieldset><legend>この対象についての判断</legend>
        <label><input type="radio" name="content-decision" value="confirmed" required onChange={() => setDecision("confirmed")} />内容と対応を確認</label>
        {entry.kind !== "discussion" && <label><input type="radio" name="content-decision" value="corrected" required onChange={() => setDecision("corrected")} />説明文を訂正して確認</label>}
        <label><input type="radio" name="content-decision" value="withheld" required onChange={() => setDecision("withheld")} />判断を保留し、掲載を止める</label>
        <label><input type="radio" name="content-decision" value="rejected" required onChange={() => setDecision("rejected")} />{entry.kind !== "discussion" ? "説明に誤りがあるため掲載を止める" : "この議案との対応が誤っているため除外する"}</label>
      </fieldset>
      {decision === "corrected" && <fieldset><legend>訂正後の説明と根拠</legend>{replacement.map((statement, index) => <div className={styles.correctionRow} key={index}>
        <label htmlFor={`replacement-${index}`}>説明{index + 1}</label><textarea id={`replacement-${index}`} required maxLength={400} rows={4} value={statement.text} onChange={(event) => setReplacement(replacement.map((row, i) => i === index ? { ...row, text: event.target.value } : row))} />
        <fieldset><legend>この文の根拠（1つ以上）</legend>{entry.sources.map((source) => <label key={source.id}><input type="checkbox" checked={statement.evidenceIds.includes(source.id as typeof statement.evidenceIds[number])} onChange={(event) => setReplacement(replacement.map((row, i) => i !== index ? row : { ...row, evidenceIds: event.target.checked ? [...row.evidenceIds, source.id as typeof row.evidenceIds[number]] : row.evidenceIds.filter((id) => id !== source.id) }))} />{source.label}</label>)}</fieldset>
        {replacement.length > 1 && <button type="button" onClick={() => setReplacement(replacement.filter((_, i) => i !== index))}>説明{index + 1}を削除</button>}
      </div>)}{replacement.length < 4 && <button type="button" onClick={() => setReplacement([...replacement, { text: "", evidenceIds: [] }])}>説明を追加</button>}</fieldset>}
      <label htmlFor="content-reviewer">確認者名（活動名可・反映後に表示）</label><input id="content-reviewer" required maxLength={80} value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
      <label htmlFor="content-note">判断・訂正の理由（反映後に表示）</label><textarea id="content-note" name="note" required maxLength={2000} rows={3} />
      <label><input type="checkbox" name="original" required />リンク先の公式原資料と表示された原文を照合しました</label>
      <label><input type="checkbox" name="meaning" required={decision === "confirmed" || decision === "corrected"} />説明の意味、または発言と議案の対応も確認しました（確認・訂正には必要）</label>
      <p>対象はこの1件だけです。ほかの議案や議員別賛否には適用しません。</p>
      {error && <p role="alert">{error}</p>}
      <button type="submit">この判断を保存待ちに追加</button>
    </form>
  </div>;
}

export default function ContentReviewWorkbench({ entries }: { entries: ContentReviewEntry[] }) {
  const [kind, setKind] = useState<ContentReview["kind"]>("explanation");
  const [targetId, setTargetId] = useState("");
  const [query, setQuery] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [queue, setQueue] = useState<Record<string, ContentReview>>({});
  const [message, setMessage] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const choices = entries.filter((row) => row.kind === kind && row.label.normalize("NFKC").includes(query.normalize("NFKC")));
  const entry = choices.find((row) => row.targetId === targetId) ?? choices[0];
  const pending = Object.values(queue);
  useEffect(() => {
    if (!pending.length || downloaded) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length, downloaded]);
  function download() {
    const file = contentReviewFileSchema.parse({ schemaVersion: 1, kind: "content_reviews", sessionId: "himeji-2025-4", records: pending });
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `himeji-content-reviews-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    setDownloaded(true); setMessage(`${pending.length}件のダウンロードを開始しました。次にプロジェクトの review-import.cmd を開いて、このファイルを選んでください。まだサイトには反映されていません。`);
  }
  return <div className={styles.workbench}>
    <div className={styles.summary}><h3>確認をまとめて記録する</h3><ol><li>下で対象を選び、公式原文と比較します。</li><li>自分が判断した1件を「保存待ち」に追加します。複数件続けて作業できます。</li><li>まとめてダウンロードし、プロジェクトの <code>review-import.cmd</code> をダブルクリックしてファイルを選ぶと反映できます。</li></ol><p>入力は外部へ送信しません。保存待ちはこのタブ内だけにあります。対象を切り替える前に判断を追加してください。</p></div>
    <div className={styles.workbenchControls}>
      <label htmlFor="content-kind">確認する種類</label><select id="content-kind" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setTargetId(""); }}><option value="explanation">大人向けの説明（{entries.filter(row => row.kind === "explanation").length}件）</option><option value="child_explanation">小学生向けの説明（{entries.filter(row => row.kind === "child_explanation").length}件）</option><option value="discussion">議案と議論の対応（72件）</option></select>
      <label htmlFor="content-query">議案番号や名前で絞る</label><input id="content-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：135、美術館" />
      <label htmlFor="content-target">対象</label><select id="content-target" value={entry?.targetId ?? ""} onChange={(event) => setTargetId(event.target.value)}>{choices.map((row) => <option key={row.targetId} value={row.targetId}>{row.label}{queue[contentReviewKey(row)] ? "（保存待ち）" : ""}</option>)}</select>
    </div>
    <div className={styles.queuePanel}>
      <p role="status" aria-live="polite">保存待ち：{pending.length}件。サイトへの反映はまだです。</p>
      {pending.length > 0 && <><ul>{pending.map((row) => <li key={row.id}>{entries.find((entry) => contentReviewKey(entry) === contentReviewKey(row))?.label}：{contentDecisionLabel[row.decision]} <button type="button" onClick={() => { const next = { ...queue }; delete next[contentReviewKey(row)]; setQueue(next); setDownloaded(false); }}>取り消す</button></li>)}</ul><button type="button" onClick={download}>保存待ち{pending.length}件をまとめてダウンロード</button></>}
      <p role="status" aria-live="polite">{message}</p>
    </div>
    {entry ? <EntryForm key={contentReviewKey(entry)} entry={entry} reviewer={reviewer} setReviewer={setReviewer} onStage={(row) => { setQueue({ ...queue, [contentReviewKey(row)]: row }); setDownloaded(false); setMessage("この1件を保存待ちに追加しました。同じ対象を追加し直すと保存待ちの内容を置き換えます。"); }} /> : <p>該当する対象がありません。絞り込みの言葉を変えてください。</p>}
  </div>;
}
