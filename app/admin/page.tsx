"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Dashboard={configured:boolean;reason?:string;limited?:boolean;today?:string;stats:null|{pageViews:number;uniqueVisitors:number;googleReaders:number;briefReaders:number;last7:{date:string;views:number;visitors:number}[]}};
export default function AdminPage(){
 const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;async function load(){try{const r=await fetch("/api/admin/dashboard",{cache:"no-store"});if(!r.ok)throw Error(r.status===403?"沒有管理者權限，請使用已授權的 Google 帳號登入":"後台暫時無法取得資料");const j=await r.json();if(active){setData(j);setError("");}}catch(e){if(active)setError(e instanceof Error?e.message:"讀取失敗");}}void load();const timer=setInterval(()=>void load(),60000);return()=>{active=false;clearInterval(timer);};},[]);
 const card=(label:string,value:number|string)=> <div style={{background:"#19283c",border:"1px solid #38506b",borderRadius:14,padding:22}}><div style={{fontSize:14,color:"#c3d2e3"}}>{label}</div><strong style={{fontSize:34}}>{value}</strong></div>;
 return <main style={{background:"#0c1626",color:"#f1f5f9",minHeight:"100vh",padding:"36px max(20px,6vw)",fontFamily:"system-ui,sans-serif"}}>
 <Link href="/" style={{color:"#87d8f8"}}>← 返回 AI 股市龍蝦</Link><h1>🦞 管理者控制台</h1><p>網站營運數據 · 台灣時間 · 每分鐘重新整理</p>
 {error?<p role="alert" style={{color:"#ff9b9b"}}>{error}</p>:!data?<p>正在載入權限與統計資料…</p>:!data.configured?<div style={{border:"1px solid #d5a350",padding:20,borderRadius:12}}><h2>尚未啟用流量統計</h2><p>{data.reason}</p><p>需先設定 Supabase 資料庫與伺服器環境變數。未連接資料庫前不會顯示虛構人數。</p></div>:<>
 <h2>今日 {data.today}</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16}}>{card("今日網站瀏覽次數",data.stats?.pageViews??0)}{card("今日獨立訪客",data.stats?.uniqueVisitors??0)}{card("今日 Google 會員閱讀九大板塊",data.stats?.googleReaders??0)}{card("今日登入會員閱讀九大板塊",data.stats?.briefReaders??0)}</div>
 <h2>最近七日趨勢</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left",borderSpacing:"0 10px"}}><thead><tr><th>日期</th><th>瀏覽次數</th><th>獨立訪客</th></tr></thead><tbody>{data.stats?.last7.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.views}</td><td>{d.visitors}</td></tr>)}</tbody></table></div>{data.limited&&<p>資料超過查詢上限，統計可能不完整。</p>}</>}
 <h2>💎 付費權限規劃</h2><div style={{background:"#19283c",padding:22,borderRadius:12}}><p><b>Free：</b>即時行情、新聞、九大板塊基本分析。</p><p><b>Pro（規劃）：</b>NT$199／月，首次可免費試用 7 天（每個帳號限一次）；進階資金輪動、歷史回測、深度籌碼訊號。</p><p><b>Admin：</b>後台統計與營運管理。</p><p style={{color:"#ffd38c"}}>目前尚未開通金流或付費權限寫入。不能將此區當成已可收費的系統。</p></div>
 <p style={{fontSize:13,color:"#aebdd0"}}>統計自功能上線後開始，不回補過去訪客；獨立訪客使用匿名瀏覽器識別碼，不等同自然人。</p>
 </main>;
}
