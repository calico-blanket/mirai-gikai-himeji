import { z } from "zod";
import { explanationDraftsSchema } from "./explanation-validation.ts";
// 対応する原資料は大人向けと共通。文章・確認記録は別に持つ。
export function childExplanationDrafts(value: unknown, adults: unknown) {
  const texts = z.record(z.string(), z.array(z.string().trim().min(1).max(400)).min(1).max(4)).parse(value);
  const drafts = explanationDraftsSchema.parse(adults);
  if (Object.keys(texts).length !== drafts.length || Object.keys(texts).some(id => !drafts.some(row => row.itemId === id))) throw new Error("小学生向け説明の議案ID・件数が一致しません");
  return drafts.map(draft => {
    const rows = texts[draft.itemId];
    if (!rows || rows.length !== draft.statements.length) throw new Error("小学生向け説明と原文の対応件数が一致しません");
    return { ...draft, statements: draft.statements.map((statement, index) => ({ ...statement, text: rows[index] })) };
  });
}
