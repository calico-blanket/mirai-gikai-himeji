import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";
import { ReaderProvider, ReaderSwitch } from "./ReaderMode";
import { siteBranding } from "../lib/site-branding";

export const viewport: Viewport = { themeColor: siteBranding.themeColor };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://127.0.0.1:3005"),
  title: "姫路の議会を知る | 令和7年第4回定例会",
  description:
    "令和7年第4回定例会を掲載対象とする非公式サービスです。姫路市の公式資料への入口をご案内します。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ReaderProvider>
        <a className={styles.skipLink} href="#main-content">本文へ移動</a>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link className={styles.siteName} href="/">姫路の議会を知る<span className={styles.provisional}>（仮称）</span></Link>
            <nav aria-label="主なページ" className={styles.navigation}>
              <Link href="/gians">議案を探す</Link>
              <Link href="/sources">公式資料を読む</Link>
              <Link href="/members">議員・会派</Link>
            </nav>
          </div>
          <div className={styles.readerBar}><ReaderSwitch /></div>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.footerTitle}>姫路市の公式サービスではありません</p>
            <p>過去の1会期を対象とする非公式サービスです。</p>
            <p>最新の情報や正式な内容は、姫路市の公式資料をご確認ください。</p>
            <p className={styles.independence}>{siteBranding.independenceNotice}</p>
            <p>「みらい議会」を参考に、新規構築している独立したサービスです。</p>
            <p className={styles.footerLinks}><a href={siteBranding.referenceSite}>みらい議会（チームみらい）</a><a href={siteBranding.referenceRepository}>「みらい議会」の公開リポジトリ</a><a href={siteBranding.guidelines}>「みらい議会」のガイドライン</a></p>
            <p>{siteBranding.sourceRepositoryUrl ? <a href={siteBranding.sourceRepositoryUrl}>このサイトのソースコード</a> : "このサイトのソースコード公開先：準備中（サービスは未公開）"}</p>
            <p className={styles.footerLinks}><Link href="/sources">資料への案内</Link><Link href="/review">確認状況</Link></p>
          </div>
        </footer>
        </ReaderProvider>
      </body>
    </html>
  );
}
