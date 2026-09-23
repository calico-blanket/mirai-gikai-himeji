import { z } from "zod";

const id = z.string().regex(/^\d+$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const snapshot = z.object({
  snapshotFile: z.string().regex(/^himeji-2025-4-minutes-(?:index|\d+)\.json$/),
  retrievalUrl: z.url().refine((url) => url.startsWith("https://himeji.gijiroku.com/voices2/cgi/VoiJson.exe?")),
  retrievedAt: z.iso.datetime({ offset: true }), sourceSha256: hash,
});
const sourceSchema = snapshot.extend({
  recordId: id, meetingTitleRaw: z.literal("令和7年第4回定例会"),
  meetingSubtitleRaw: z.string().min(1), meetingDate: z.iso.date(),
  speechCount: z.number().int().positive(), url: z.url(), reviewStatus: z.literal("unreviewed"),
});
const manifestSchema = z.strictObject({
  sessionId: z.literal("himeji-2025-4"), scope: z.literal("plenary_only"),
  indexSource: snapshot, sources: z.array(sourceSchema).length(5),
});
const rowSchema = z.strictObject({
  id: z.string().min(1), itemId: z.string().min(1), recordId: id, speechId: id,
  kind: z.enum(["proposal", "question", "answer", "committee_report", "debate"]),
  method: z.enum(["proposal_block", "explicit_number", "contextual_answer"]),
  paragraphIndexes: z.array(z.number().int().nonnegative()).min(1), excerptRaw: z.string().min(1),
  evidence: z.array(z.strictObject({ speechId: id, paragraphIndex: z.number().int().nonnegative(), raw: z.string().min(1) })),
  sourceSha256: hash, reviewStatus: z.literal("unreviewed"),
});
const candidateSchema = z.strictObject({
  sessionId: z.literal("himeji-2025-4"), scope: z.literal("plenary_only"), rows: z.array(rowSchema),
});
const speechSchema = z.object({ HUID: id, HTGN: z.string(), NAME: z.string(), YAKU: z.string(), KTYP: z.string() });
const payloadSchema = z.object({ status: z.literal(0), filist: z.object({
  FINO: id, TITL: z.literal("令和7年第4回定例会"), SUBT: z.string(), DATE: z.string(),
  allcount: z.coerce.number().int(), data: z.array(speechSchema),
}) });

export type DiscussionRow = z.infer<typeof rowSchema>;
export type MinutesSource = z.infer<typeof sourceSchema>;
export type MinutesSpeech = z.infer<typeof speechSchema>;
export type DiscussionView = DiscussionRow & { source: MinutesSource; speech: MinutesSpeech; url: string };
export const discussionKindLabel: Record<DiscussionRow["kind"], string> = {
  proposal: "提案理由の説明", question: "質問", answer: "答弁", committee_report: "本会議での委員長報告", debate: "討論",
};

export function validateDiscussions(manifestInput: unknown, candidateInput: unknown, itemIds: string[], files: Record<string, { sha256: string; payload: unknown }>) {
  const manifest = manifestSchema.parse(manifestInput);
  const candidate = candidateSchema.parse(candidateInput);
  const sourceById = new Map<string, MinutesSource>();
  const speechesByRecord = new Map<string, Map<string, MinutesSpeech>>();
  const indexFile = files[manifest.indexSource.snapshotFile];
  if (!indexFile || indexFile.sha256 !== manifest.indexSource.sourceSha256) throw new Error("会期一覧の版が異なります");
  const index = z.object({ status: z.literal(0), searchlist: z.object({ data: z.array(z.object({
    TITL: z.literal("令和7年第4回定例会"), HITHU: z.array(z.object({ FINO: id })).length(5),
  })).length(1) }) }).parse(indexFile.payload);
  const expectedIds = index.searchlist.data[0].HITHU.map((entry) => entry.FINO).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(manifest.sources.map((source) => source.recordId).sort())) throw new Error("会議録の取得範囲が異なります");
  for (const source of manifest.sources) {
    if (sourceById.has(source.recordId)) throw new Error("会議録IDが重複しています");
    const file = files[source.snapshotFile];
    if (!file || file.sha256 !== source.sourceSha256) throw new Error("会議録の版が異なります");
    const meeting = payloadSchema.parse(file.payload).filist;
    const date = source.meetingDate.replaceAll("-", "");
    if (meeting.FINO !== source.recordId || meeting.SUBT !== source.meetingSubtitleRaw || meeting.DATE !== date || meeting.data.length !== source.speechCount || meeting.allcount !== source.speechCount) throw new Error("会議録の件数・日付・参照が不一致です");
    if (source.url !== `https://himeji.gijiroku.com/voices2/minutes.html?FINO=${source.recordId}`) throw new Error("出典URLが不一致です");
    const speeches = new Map(meeting.data.map((speech) => [speech.HUID, speech]));
    if (speeches.size !== meeting.data.length) throw new Error("発言IDが重複しています");
    sourceById.set(source.recordId, source);
    speechesByRecord.set(source.recordId, speeches);
  }
  const unique = new Set<string>();
  const rows: DiscussionView[] = [];
  for (const row of candidate.rows) {
    const key = `${row.recordId}-${row.speechId}-${row.itemId}`;
    if (row.id !== key || unique.has(key)) throw new Error("発言対応IDが不正または重複しています");
    unique.add(key);
    if (!itemIds.includes(row.itemId)) throw new Error("存在しない議案への対応です");
    const source = sourceById.get(row.recordId);
    const speeches = speechesByRecord.get(row.recordId);
    const speech = speeches?.get(row.speechId);
    if (!source || !speech || row.sourceSha256 !== source.sourceSha256) throw new Error("発言参照または出典の版が不一致です");
    if (["0", "1"].includes(speech.KTYP)) throw new Error("出席者一覧・議長進行を議論に含められません");
    const paragraphs = speech.HTGN.split(/\r?\n/);
    if (row.paragraphIndexes.some((index, i, all) => index >= paragraphs.length || (i > 0 && index <= all[i - 1]))) throw new Error("原文段落の範囲・順序が不正です");
    if (row.excerptRaw !== row.paragraphIndexes.map((index) => paragraphs[index]).join("\n")) throw new Error("抜粋が保存済み原文と一致しません");
    for (const evidence of row.evidence) {
      if (speeches?.get(evidence.speechId)?.HTGN.split(/\r?\n/)[evidence.paragraphIndex] !== evidence.raw) throw new Error("対応根拠が原文と一致しません");
    }
    if (row.method === "contextual_answer") {
      // 固有の根拠を持つ1件のみ。別項目への答弁に一般化しない。
      const evidenceIds = row.evidence.map((entry) => entry.speechId).join(",");
      if (row.recordId !== "2418" || row.speechId !== "202111" || row.itemId !== "bill-135" || row.kind !== "answer" || evidenceIds !== "202103,202105,202111" || !row.evidence[0].raw.includes("初めに、議案第135号") || !row.evidence[1].raw.includes("杉本博昭議員の質疑質問に対する答弁") || !row.evidence[2].raw.normalize("NFKC").includes("1項目めについてお答え")) throw new Error("答弁の対応根拠が不足しています");
    } else {
      if (row.evidence.length) throw new Error("文脈対応以外の追加根拠は未対応です");
      const number = row.itemId.split("-").at(-1);
      const label = row.itemId.startsWith("bill-") ? "議案" : "諮問";
      if (!new RegExp(`${label}第?${number}号`).test(row.excerptRaw.normalize("NFKC"))) throw new Error("原文に対象番号がありません");
      if (row.method === "proposal_block") {
        if (row.kind !== "proposal" || !["2417-202071", "2433-203273"].includes(`${row.recordId}-${row.speechId}`)) throw new Error("提案説明の参照が不正です");
        const lead = row.excerptRaw.normalize("NFKC").trimStart();
        const first = new RegExp(`^(?:続きまして、)?${label}第?(\\d+)号(?:から${label}第?(\\d+)号)?`).exec(lead);
        const paired162 = row.recordId === "2417" && row.speechId === "202071" && row.itemId === "bill-162" && first?.[1] === "161" && lead.includes("について、議案第162号、加古川市外2市共有公会堂事務組合の解散に伴う財産処分");
        if (!first || Number(number) < Number(first[1]) || (Number(number) > Number(first[2] ?? first[1]) && !paired162)) throw new Error("段落先頭の議案と対応が異なります");
      } else if (row.kind === "proposal" || ["202071", "203273"].includes(row.speechId)) throw new Error("提案説明は段落先頭から対応付けてください");
    }
    rows.push({ ...row, source, speech, url: `${source.url}&HUID=${row.speechId}` });
  }
  return { rows, sources: manifest.sources, speechCount: manifest.sources.reduce((sum, source) => sum + source.speechCount, 0) };
}
