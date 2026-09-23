"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
export type ReaderAudience = "adult" | "child";
const ReaderContext = createContext<{ audience: ReaderAudience; change: (value: ReaderAudience) => void }>({ audience: "adult", change: () => {} });
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [audience, setAudience] = useState<ReaderAudience>("adult");
  useEffect(() => { try { if (localStorage.getItem("himeji-reader") === "child") setAudience("child"); } catch { /* 保存できない環境でも切り替えられる */ } }, []);
  function change(value: ReaderAudience) { setAudience(value); try { localStorage.setItem("himeji-reader", value); } catch { /* 保存は任意 */ } }
  return <ReaderContext.Provider value={{ audience, change }}>{children}</ReaderContext.Provider>;
}
export function ReaderSwitch() {
  const { audience, change } = useContext(ReaderContext);
  return <div className="reader-switch"><div role="group" aria-label="説明の読み方"><span>説明の読み方</span><button type="button" aria-pressed={audience === "adult"} onClick={() => change("adult")}>大人向け</button><button type="button" aria-pressed={audience === "child"} onClick={() => change("child")}>小学生向け</button></div><p aria-live="polite">{audience === "child" ? "やさしい ことばで よもう。市の もとの資料は、そのまま のせています。" : "説明の言葉を切り替えます。公式原文・議決結果・賛否は共通です。"}</p></div>;
}
export function AudienceContent({ audience, children }: { audience: ReaderAudience; children: ReactNode }) {
  const selected = useContext(ReaderContext).audience;
  return <div data-reader-content={audience} hidden={selected !== audience}>{children}</div>;
}
export function ReaderText({ adult, child }: { adult: string; child: string }) {
  return <>{useContext(ReaderContext).audience === "child" ? child : adult}</>;
}
