import { ImageResponse } from "next/og";
export const alt = "姫路の議会を知る：令和7年第4回定例会を対象とする非公式サービス";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 外部フォント・参照元プロジェクトの画像を使用しない、このサービス独自の共有用画像。
export default function Image() {
  return new ImageResponse(<div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", padding:70, gap:60, background:"#fffcf7", color:"#245d69", fontFamily:"sans-serif" }}>
    <div style={{ display:"flex", flexDirection:"column", width:650 }}><div style={{ fontSize:24, letterSpacing:5 }}>HIMEJI / COUNCIL RECORDS</div><div style={{ fontSize:82, fontWeight:700, lineHeight:1.1, marginTop:35 }}>Read. Understand. Explore.</div><div style={{ fontSize:26, marginTop:40 }}>2025 / 4th regular session</div><div style={{ fontSize:22, marginTop:18 }}>Independent, unofficial civic information</div></div>
    <svg width="300" height="340" viewBox="0 0 64 72"><rect width="64" height="72" rx="20" fill="#e4efed"/><path d="M9 58h46M18 54V34h28v20M24 34V22h16v12" fill="#fff" stroke="#245d69" strokeWidth="2"/><path d="M12 36l20-12 20 12M20 23l12-10 12 10" fill="none" stroke="#245d69" strokeWidth="3" strokeLinejoin="round"/><path d="M29 54V42h6v12" fill="#245d69"/><circle cx="49" cy="15" r="6" fill="#edbd97"/></svg>
  </div>, size);
}
