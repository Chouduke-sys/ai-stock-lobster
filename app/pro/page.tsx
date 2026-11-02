import Link from "next/link";
import {createHash} from "node:crypto";
import {getServerSession} from "next-auth";
import {authOptions} from "../../lib/auth";
import ProWorkspace from "../components/ProWorkspace";
import "./pro.css";
export const dynamic="force-dynamic";
export default async function ProPage(){
 const session=await getServerSession(authOptions);
 const accountKey=session?.user?.email?createHash("sha256").update(String((session as any).provider??"")+":"+session.user.email.toLowerCase()).digest("hex"):null;
 return <main className="pro-shell">
  <header className="pro-topbar"><Link href="/" className="pro-brand">🦞 AI 股市龍蝦 <span>PRO RESEARCH</span></Link><Link href="/">返回市場總覽 ↗</Link></header>
  <div className="pro-heading"><div><span className="pro-kicker">YOUR RESEARCH DESK</span><h1>把市場訊號，整理成你的研究。</h1><p>追蹤自選股、比較產業熱度，從歷史資料檢視價格與量能。</p></div><span className="pro-access">現有會員免費體驗 · 不收費</span></div>
  {accountKey?<ProWorkspace key={accountKey} accountKey={accountKey}/>:<section className="pro-gate"><span className="pro-kicker">MEMBER ACCESS</span><h2>登入即可開啟 Pro 研究工作台</h2><p>所有現有登入會員皆可免費體驗，無需訂閱或填寫付款資料。</p><div className="pro-feature-grid">{["自選股與研究筆記","5／10／20 日產業比較","均線、RSI 與量能分析","可匯出的研究摘要"].map(feature=><div key={feature}>{feature}</div>)}</div><Link className="pro-button" href="/?login=1">前往會員登入</Link></section>}
  <footer className="pro-footer">Pro 免費體驗版 · 個股與產業資料皆標示日期及來源 · 價格未還原除權息，歷史結果不保證未來表現。</footer>
 </main>;
}
