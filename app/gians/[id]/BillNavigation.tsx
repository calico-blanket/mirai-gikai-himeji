"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { billListReturn } from "../../../lib/bill-search";
import styles from "../gians.module.css";

type Neighbor = { id: string; number: string; title: string } | null;
export default function BillNavigation({ previous, next }: { previous: Neighbor; next: Neighbor }) {
  const [back, setBack] = useState("/gians");
  useEffect(() => { setBack(billListReturn(window.location.search)); }, []);
  const suffix = back.includes("?") ? `?list=${encodeURIComponent(back.split("?")[1])}` : "";
  return <nav className={styles.billNavigation} aria-label="ほかの議案へ移動">
    <Link href={back}>検索条件を保って議案一覧へ</Link>
    <div>{previous && <Link href={`/gians/${previous.id}${suffix}`}>前の議案：{previous.number}<span>{previous.title}</span></Link>}{next && <Link href={`/gians/${next.id}${suffix}`}>次の議案：{next.number}<span>{next.title}</span></Link>}</div>
    <p>前後の議案は、この会期の掲載順です。</p>
  </nav>;
}
