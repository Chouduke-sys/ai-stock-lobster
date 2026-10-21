"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, CircleHelp, Globe2, Landmark, LockKeyhole, Menu, Newspaper, Search, ShieldCheck, TrendingUp, X } from "lucide-react";

type NewsRow={title:string;url:string;publishedAt:string|null;source:string;imageUrl:string|null;summary:string|null};
type RankRow = { symbol: string; name: string; netShares: number; market:"twse"|"tpex" };
type HistoryRow = { date:string; open:number; high:number; low:number; close:number; volume:number; ma5:number|null; ma10:number|null; ma20:number|null; ma60:number|null; rsi14:number|null; dif:number|null; signal:number|null; histogram:number|null };
type HistoryResult = { status:string; symbol:string; period:string; asOf:string; candles:HistoryRow[]; dataSource:string };
type TaiexResult = { status: string; date: string | null; value: number | null; change: number | null; changePercent: number | null; delaySeconds?: number | null; recent: { date: string | null; value: number | null }[] };
type CloseResult={status:string;date:string;value:number;change:number|null;dataSource:string};
type NightResult={status:string;price:number;contract:string;quoteTime:string;delaySeconds:number;dataSource:string};
type StockResult = {
  status: string;
  symbol: string;
  name: string | null;
  dataDate: string | null;
  quote: { open: number | null; high: number | null; low: number | null; close: number | null; change: number | null; volume: number | null; tradeValue: number | null; transactions: number | null };
  dataSource: string;
  lastUpdatedAt: string;
  isRealtime: boolean;
  delaySeconds?: number | null;
};
const formatPrice = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const ageLabel = (s: number | null | undefined) => s == null ? "報價時間未確認" : s < 60 ? `距報價 ${s} 秒` : `距報價 ${Math.floor(s / 60)} 分鐘`;
const formatVolume = (value: number | null | undefined) => value == null ? "—" : Math.round(value).toLocaleString("zh-TW");
type IntradayPoint={time:string;price:number;date:string};
function saveStockPoint(symbol:string,iso:string,price:number):IntradayPoint[]{
 const t=parts(iso),key="lobster-stock-intraday-"+symbol;
 const point={time:t.date+" "+String(t.hour).padStart(2,"0")+":"+String(t.minute).padStart(2,"0"),price,date:t.date};
 try{
  const prev=JSON.parse(localStorage.getItem(key)||"[]") as IntradayPoint[];
  const rows=prev.filter(x=>x.date===t.date&&x.time!==point.time&&Number.isFinite(x.price));
  rows.push(point);rows.sort((a,b)=>a.time.localeCompare(b.time));
  const limited=rows.slice(-350);localStorage.setItem(key,JSON.stringify(limited));return limited;
 }catch{return [point];}
}
function IntradayChart({points,reference}:{points:IntradayPoint[];reference:number|null}){
 if(points.length<2)return <div className="spark-empty" style={{minHeight:250}}><Activity size={20}/><span>正在累積盤中報價，至少需要兩個不同分鐘的有效成交價</span></div>;
 const prices=points.map(p=>p.price),min=Math.min(...prices,reference??Infinity),max=Math.max(...prices,reference??-Infinity);
 const pad=Math.max((max-min)*.12,max*.002,.1),lo=min-pad,hi=max+pad;
 const x=(i:number)=>52+i/Math.max(points.length-1,1)*716;
 const y=(v:number)=>245-(v-lo)/(hi-lo)*210;
 const path=points.map((p,i)=>x(i).toFixed(1)+","+y(p.price).toFixed(1)).join(" ");
 const last=points[points.length-1];
 return <div><svg viewBox="0 0 800 290" className="candle-svg" role="img" aria-label="盤中股價取樣走勢圖">
  {[0,1,2,3,4].map(i=><g key={i}><line x1="52" x2="768" y1={35+i*52.5} y2={35+i*52.5} stroke="#334155" strokeDasharray="3 5"/><text x="5" y={39+i*52.5} fontSize="12" fill="#94a3b8">{(hi-(hi-lo)*i/4).toFixed(2)}</text></g>)}
  {reference!==null&&<line x1="52" x2="768" y1={y(reference)} y2={y(reference)} stroke="#eab308" strokeDasharray="5 5"/>}
  <polyline points={path} fill="none" stroke="#fb725b" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
  <circle cx={x(points.length-1)} cy={y(last.price)} r="4" fill="#fb725b"/>
  <text x="52" y="276" fontSize="12" fill="#94a3b8">{points[0].time.slice(11)}</text><text x="768" y="276" textAnchor="end" fontSize="12" fill="#94a3b8">{last.time.slice(11)}</text>
 </svg><p className="footnote">最新取樣 {last.time.slice(11)} · {formatPrice(last.price)} 元 · 黃色虛線為前收參考價（如有）</p></div>;
}

type Point={time:string;value:number;session:string};
function parts(iso:string){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));const v=(k:string)=>p.find(x=>x.type===k)?.value??"";return {date:v("year")+"-"+v("month")+"-"+v("day"),hour:Number(v("hour")),minute:Number(v("minute"))};}
function record(kind:"taiex"|"tx",iso:string,value:number):Point[]{
 const t=parts(iso),time=t.date+" "+String(t.hour).padStart(2,"0")+":"+String(t.minute).padStart(2,"0");
 const session=kind==="taiex"?t.date:t.hour<5?new Date(new Date(t.date+"T12:00:00+08:00").getTime()-86400000).toISOString().slice(0,10):t.date;
 const key="lobster-minute-"+kind;
 try{const prev=JSON.parse(localStorage.getItem(key)||"[]") as Point[];const list=prev.filter(p=>p.session===session&&p.time!==time&&Number.isFinite(p.value));list.push({time,value,session});list.sort((a,b)=>a.time.localeCompare(b.time));const limited=list.slice(-900);localStorage.setItem(key,JSON.stringify(limited));return limited;}catch{return [{time,value,session}];}
}
function readPoints(kind:"taiex"|"tx"):Point[]{
 try{const raw=JSON.parse(localStorage.getItem("lobster-minute-"+kind)||"[]") as Point[];return Array.isArray(raw)?raw.filter(p=>Number.isFinite(p.value)&&typeof p.time==="string"):[];}catch{return [];}
}
function HourChart({points,base}:{points:Point[];base:number|null}){
 if(!points.length)return <div className="spark-empty"><Activity size={20}/><span>尚未取得有效盤中報價；取得後開始記錄走勢</span></div>;
 const values=points.map(p=>p.value-(base??points[0].value)),lo=Math.min(0,...values),hi=Math.max(0,...values),range=Math.max(hi-lo,1);
 const x=(i:number)=>points.length===1?50:3+i/(points.length-1)*94;
 const y=(v:number)=>90-(v-lo)/range*80;
 const path=values.map((v,i)=>x(i).toFixed(2)+","+y(v).toFixed(2)).join(" ");
 return <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="盤中報價取樣漲跌點數走勢" style={{position:"relative",width:"100%",height:"100%"}}><line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="#64748b" strokeDasharray="2 2"/>{points.length>1?<polyline points={path} fill="none" stroke="#fb725b" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>:<circle cx="50" cy={y(values[0])} r="2.5" fill="#fb725b"/>}</svg>;
}

export default function Home() {
  const [rankSide, setRankSide] = useState<"buy" | "sell">("buy");
  const [market, setMarket] = useState("twse");
  const [investor, setInvestor] = useState("all");
  const [stockPoints,setStockPoints]=useState<IntradayPoint[]>([]);
  const [symbol, setSymbol] = useState("2330");
  const [search, setSearch] = useState("");
  const [news, setNews] = useState<NewsRow[]>([]);
  const [newsError, setNewsError] = useState("");
  const [newsFetchedAt, setNewsFetchedAt] = useState<string|null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [stockData, setStockData] = useState<StockResult | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [taiex, setTaiex] = useState<TaiexResult | null>(null);
  const [taiexError, setTaiexError] = useState("");
  const [closing, setClosing] = useState<CloseResult|null>(null);
  const [closingError, setClosingError] = useState("");
  const [night, setNight] = useState<NightResult|null>(null);
  const [nightError, setNightError] = useState("");
  const [dayPoints,setDayPoints]=useState<Point[]>([]);
  const [nightPoints,setNightPoints]=useState<Point[]>([]);
  useEffect(()=>{setDayPoints(readPoints("taiex"));setNightPoints(readPoints("tx"));},[]);
  const [indexTrendError, setIndexTrendError] = useState("");
  const [loadingTaiex, setLoadingTaiex] = useState(true);
  const [rankRows, setRankRows] = useState<RankRow[]>([]);
  const [fiveMode,setFiveMode]=useState<"streak"|"sum">("streak");
  const [fiveRows,setFiveRows]=useState<(RankRow & {dailyShares:number[]})[]>([]);
  const [fiveDates,setFiveDates]=useState<string[]>([]);
  const [fiveError,setFiveError]=useState("");
  const [fiveLoading,setFiveLoading]=useState(false);
  const [rankError, setRankError] = useState("");
  const [rankDate, setRankDate] = useState("");
  const [loadingRank, setLoadingRank] = useState(true);



  const [quoteRefreshAt, setQuoteRefreshAt] = useState<string | null>(null);

  const rows = rankRows;

  useEffect(() => {
    const controller = new AbortController();
    async function loadRanks() {
      setLoadingRank(true); setRankError(""); setRankRows([]);
      try {
        const params = new URLSearchParams({market,investor,side:rankSide});
        const response = await fetch(`/api/institutional?${params}`,{signal:controller.signal});
        const data = await response.json();
        if(!response.ok || data.status!=="ok")throw new Error(data.error || "法人排行暫無資料");
        setRankRows(data.rows);setRankDate(data.dataDate);
      }catch(e){if(!controller.signal.aborted)setRankError(e instanceof Error?e.message:"法人排行讀取失敗");}
      finally{if(!controller.signal.aborted)setLoadingRank(false);}
    }
    void loadRanks();
    return ()=>controller.abort();
  },[market,investor,rankSide]);

  useEffect(() => {
    const controller=new AbortController();
    async function loadFive(){
      setFiveLoading(true);setFiveRows([]);setFiveDates([]);setFiveError("");
      if(market!=="twse"){setFiveError("連續三日功能目前先提供上市股票，請選擇上市股票。");setFiveLoading(false);return;}
      try{
        const q=new URLSearchParams({market,investor,side:rankSide,mode:fiveMode});
        const response=await fetch("/api/institutional/continuous?"+q,{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"五日資料無法取得");
        setFiveRows(data.rows);setFiveDates(data.dates);
      }catch(e){if(!controller.signal.aborted)setFiveError(e instanceof Error?e.message:"五日資料讀取失敗");}
      finally{if(!controller.signal.aborted)setFiveLoading(false);}
    }
    void loadFive();
    return ()=>controller.abort();
  },[market,investor,rankSide,fiveMode]);

  useEffect(()=>{try{const raw=JSON.parse(localStorage.getItem("lobster-stock-intraday-"+symbol)||"[]") as IntradayPoint[];const now=parts(new Date().toISOString()).date;setStockPoints(raw.filter(x=>x.date===now&&Number.isFinite(x.price)));}catch{setStockPoints([]);}},[symbol]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function loadQuote() {
      if (inFlight) return;
      inFlight = true;
      setLoadingQuote(true);
      setQuoteError("");
      try {
        const response = await fetch(`/api/stocks/${symbol}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || result.status !== "ok") {
          throw new Error(result.error || "行情查詢失敗");
        }
        setStockData(result as StockResult);
        if(typeof result.quote?.last==="number"&&typeof result.quoteTime==="string"){
          const t=parts(result.quoteTime);
          if((t.hour===9||t.hour===10||t.hour===11||t.hour===12||(t.hour===13&&t.minute<=30))&&t.date===parts(new Date().toISOString()).date)setStockPoints(saveStockPoint(symbol,result.quoteTime,result.quote.last));
        }
        setQuoteRefreshAt(new Date().toISOString());
      } catch (error) {
        if (!controller.signal.aborted) {
          setQuoteError(error instanceof Error ? error.message : "行情查詢失敗");
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoadingQuote(false);
      }
    }
    void loadQuote();
    const timer = setInterval(() => { void loadQuote(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function loadIndex() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/market/taiex", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || result.status !== "ok") throw new Error(result.error || "加權指數查詢失敗");
        setTaiex(result as TaiexResult);
        if(typeof result.value==="number"&&typeof result.quoteTime==="string"){const t=parts(result.quoteTime);if((t.hour>=9&&t.hour<13)||(t.hour===13&&t.minute<=30))setDayPoints(record("taiex",result.quoteTime,result.value));}
      } catch (error) {
        if (!controller.signal.aborted) { setTaiex(null); setTaiexError(error instanceof Error ? error.message : "加權指數查詢失敗"); }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoadingTaiex(false);
      }
    }
    void loadIndex();
    const timer = setInterval(() => { void loadIndex(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(()=>{
    const controller=new AbortController();
    async function loadClose(){
      try{
        const response=await fetch("/api/market/taiex/close",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"收盤資料讀取失敗");
        setClosing(data);setClosingError("");
      }catch(e){if(!controller.signal.aborted){setClosing(null);setClosingError(e instanceof Error?e.message:"收盤資料讀取失敗");}}
    }
    void loadClose();
    const timer=setInterval(()=>{void loadClose();},300000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    let inFlight=false;
    async function loadNight(){
      if(inFlight)return;
      inFlight=true;
      try{
        const response=await fetch("/api/market/taiex/night",{cache:"no-store",signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"夜盤行情暫不可用");
        setNight(data);setNightError("");
        if(typeof data.price==="number"&&typeof data.quoteTime==="string")setNightPoints(record("tx",data.quoteTime,data.price));
      }catch(e){if(!controller.signal.aborted){setNight(null);setNightError(e instanceof Error?e.message:"夜盤行情暫不可用");}}
      finally{inFlight=false;}
    }
    void loadNight();
    const timer=setInterval(()=>{void loadNight();},5000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    let inFlight=false;
    async function loadNews(){
      if(inFlight)return;inFlight=true;
      try{
        const response=await fetch("/api/news/futu",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok"||!Array.isArray(data.news))throw new Error(data.error||"新聞讀取失敗");
        setNews(data.news);setNewsFetchedAt(new Date().toISOString());setNewsError("");
      }catch(e){if(!controller.signal.aborted){setNewsError(e instanceof Error?e.message:"新聞讀取失敗");setNews([]);}}
      finally{inFlight=false;}
    }
    void loadNews();
    const timer=setInterval(()=>{void loadNews();},300000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);

  function lookupStock() {
    const value = search.trim();
    if (!/^\d{4,6}$/.test(value)) {
      setMessage("請輸入 4 至 6 位數字股票代號。");
      return;
    }
    setSymbol(value);
    setMessage("");
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="AI股市龍蝦首頁">
          <span className="brand-mark brand-mark-custom"><img src="/ai-stock-lobster-logo.png" alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span>
          <span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE · TAIWAN</small></span>
        </a>
        <nav className="nav-links"><a href="#rankings">法人排行</a><a href="#charts">個股走勢</a><a href="#global">全球資訊</a><a href="#membership">會員方案</a></nav>
        <button className="btn btn-outline login-btn" onClick={() => setShowLogin(!showLogin)}><LockKeyhole size={16}/> 會員登入</button>
        <button className="icon-btn mobile-menu" aria-label="開啟登入面板" onClick={() => setShowLogin(!showLogin)}><Menu size={20}/></button>
      </header>

      {showLogin && <section className="modal-card">
        <button className="close-btn" onClick={() => setShowLogin(false)} aria-label="關閉"><X size={18}/></button>
        <h2>會員登入</h2><p>此專案目前尚未串接真實會員驗證。</p>
        <label>電子郵件<input type="email" placeholder="you@example.com" autoComplete="email"/></label>
        <label>密碼<input type="password" placeholder="輸入密碼" autoComplete="current-password"/></label>
        <button className="btn btn-primary" onClick={() => setMessage("登入功能尚未啟用：請先設定正式驗證服務。")}>登入</button>
      </section>}

      <section className="hero">
        <div className="hero-copy" style={{alignSelf:"stretch",display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:12}}>
          <div className="eyebrow"><span className="live-dot"></span> GLOBAL FINANCIAL NEWS · 富途牛牛</div>
          <h2 style={{fontSize:"clamp(24px,2.6vw,38px)",margin:"14px 0 6px"}}>全球即時財經快訊</h2>
          <p style={{margin:"0 0 12px",fontSize:13}}>富途牛牛新聞搜尋 · 每 5 分鐘重新查詢 · 標題點擊閱讀原文</p>
          {news.length>0 ? <div style={{display:"grid",gap:0,maxHeight:420,overflowY:"auto",paddingRight:6}}>
            {news.slice(0,10).map((item,i)=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid #64748b33",color:"inherit",textDecoration:"none"}}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" style={{width:92,height:68,flexShrink:0,objectFit:"cover",borderRadius:8,background:"#1e293b"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div aria-hidden="true" style={{width:92,height:68,flexShrink:0,borderRadius:8,background:"#182437",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8"}}><Newspaper size={24}/></div>}
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:17,fontWeight:650,lineHeight:1.6}}><span style={{color:"#fb725b",marginRight:8}}>{String(i+1).padStart(2,"0")}</span>{item.title}</div>
                {item.summary && <p style={{fontSize:14,lineHeight:1.65,color:"#cbd5e1",margin:"5px 0 0",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.summary}</p>}
                <small style={{color:"#94a3b8",display:"block",marginTop:7,fontSize:13}}>{item.source} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"發布時間未提供"}</small>
              </div>
            </a>)}
          </div> : <div style={{padding:"22px 0",fontSize:14,color:"#94a3b8"}}>{newsError||"正在載入富途牛牛財經新聞…"}</div>}
          <div style={{marginTop:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <a href="https://news.futunn.com/main" target="_blank" rel="noopener noreferrer" style={{color:"#fb725b",fontSize:14}}>前往富途牛牛查看最新新聞 ↗</a>
            <small style={{color:"#94a3b8"}}>{newsFetchedAt?"本站查詢："+new Date(newsFetchedAt).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei"}):"尚未成功更新"}</small>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-top"><span>MARKET FLOW</span><span className="tag tag-amber">{taiex ? "盤中行情測試資料" : loadingTaiex ? "載入中" : "暫無資料"}</span></div>
          <div className="visual-stat"><span>台股加權指數</span><strong>{formatPrice(taiex?.value)}</strong><small>{taiex ? `${taiex.date ?? "日期未提供"} · 漲跌 ${formatPrice(taiex.change)} 點（${formatPrice(taiex.changePercent)}%）· ${ageLabel(taiex.delaySeconds)} · 每 5 秒查詢 · 不保證即時` : loadingTaiex ? "載入盤中行情中…" : taiexError}</small></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,margin:"16px 0"}}>
            <div style={{padding:14,border:"1px solid #64748b55",borderRadius:12}}>
              <small>加權指數 · 最近收盤</small>
              <strong style={{display:"block",fontSize:24}}>{formatPrice(closing?.value)}</strong>
              <small>{closing ? `${closing.date} 收盤 · ${closing.dataSource}` : closingError || "讀取中"}</small>
            </div>
            <div style={{padding:14,border:"1px solid #64748b55",borderRadius:12}}>
              <small>臺股期貨 TX · 夜盤（不同於加權指數）</small>
              <strong style={{display:"block",fontSize:24}}>{formatPrice(night?.price)}</strong>
              <small>{night ? `${night.contract} · ${new Date(night.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})} · ${ageLabel(night.delaySeconds)} · 每 5 秒查詢` : nightError || "讀取中"}</small>
            </div>
          </div>
          <div style={{fontWeight:700,fontSize:13,marginTop:12}}>加權指數 · 日盤走勢圖（5 秒查詢）</div>
          <div className="sparkline"><div className="spark-grid"></div><HourChart points={dayPoints} base={taiex?.value!=null&&taiex.change!=null?taiex.value-taiex.change:closing?.date!==taiex?.date?closing?.value??null:null}/></div>
          <p className="footnote">日盤 09:00～13:30，相對前一交易日收盤；每 5 秒查詢，按分鐘保留最新有效報價；目前累積 {dayPoints.length} 筆。僅為本機取樣，不是完整官方即時分時歷史。</p>
          <div style={{fontWeight:700,fontSize:13,marginTop:12}}>台指期 TX 夜盤走勢圖（5 秒查詢）</div>
          <div className="sparkline"><div className="spark-grid"></div><HourChart points={nightPoints} base={nightPoints[0]?.value??null}/></div>
          <p className="footnote">夜盤 15:00～次日 05:00，按分鐘記錄報價，相對本次記錄首筆價格；目前累積 {nightPoints.length} 筆。需授權行情來源，未設定時不顯示虛構價格。{nightError}</p>
          <div className="visual-bottom"><span><i className="dot dot-red"></i> 台股官方資料</span><span><i className="dot dot-blue"></i> 全球行情 API</span></div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><span className="stat-label"><Activity size={16}/> 加權指數</span><strong>{formatPrice(taiex?.value)}</strong><small>{taiex ? `${taiex.date ?? "日期未提供"} · ${formatPrice(taiex.change)} 點（${ageLabel(taiex.delaySeconds)}）` : loadingTaiex ? "載入中" : taiexError || "暫無資料"}</small></article>
        <article className="stat-card"><span className="stat-label"><Landmark size={16}/> 三大法人排行</span><strong>{rankDate || "待公布"}</strong><small>{rankDate ? "最新已取得交易日 · 盤後資料" : "等待官方日報，非盤中即時"}</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowUpRight size={16}/> {rankSide==="buy"?"買超":"賣超"}榜首</span><strong>{rows[0]?.name || "待更新"}</strong><small>{rows[0]?`${rows[0].symbol} · ${formatVolume(rows[0].netShares)} 股`:"尚無可驗證排名"}</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowDownRight size={16}/> 三日法人動向</span><strong>{fiveLoading?"查詢中":fiveRows.length?fiveRows[0].name:"待確認"}</strong><small>{fiveRows.length?`三日合計 ${formatVolume(fiveRows[0].netShares)} 股`:"尚無完整三日排行"}</small></article>
      </section>

      <style>{`
        .institutional-side-by-side { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; align-items:start; margin:24px 0 32px; }
        .institutional-side-by-side .institutional-panel { min-width:0; margin:0; padding:24px 0; }
        .institutional-side-by-side .section-heading { align-items:flex-start; gap:12px; flex-wrap:wrap; }
        .institutional-side-by-side .section-heading h2 { font-size:clamp(24px,2vw,30px); }
        .institutional-side-by-side .section-heading p { font-size:15px; line-height:1.6; }
        .institutional-side-by-side .table-wrap { overflow-x:auto; }
        .institutional-side-by-side table { min-width:560px; }
        .institutional-side-by-side th { font-size:14px; padding:15px 12px; white-space:nowrap; }
        .institutional-side-by-side td { font-size:16px; padding:17px 12px; white-space:nowrap; }
        .institutional-side-by-side .filters { flex-wrap:wrap; gap:12px; }
        .institutional-side-by-side .footnote { font-size:13px; line-height:1.65; }
        @media(max-width:1050px){ .institutional-side-by-side { grid-template-columns:minmax(0,1fr); gap:12px; } }
      `}</style>
      <div className="institutional-side-by-side">
      <section className="section institutional-panel" id="rankings">
        <div className="section-heading"><div><div className="eyebrow">INSTITUTIONAL FLOW</div><h2>三大法人買賣超排行</h2><p>當日買超與賣超前五名 · 盤後公布</p></div><span className="tag tag-amber">{rankDate && rows.length ? `資料日 ${rankDate}` : loadingRank ? "讀取中" : "最新交易日資料待確認"}</span></div>
        <div className="filters">
          <label>市場<select value={market} onChange={e => setMarket(e.target.value)}><option value="all">上市＋上櫃</option><option value="twse">上市股票</option><option value="tpex">上櫃股票</option></select></label>
          <label>法人<select value={investor} onChange={e => setInvestor(e.target.value)}><option value="all">三大法人合計</option><option value="foreign">外資及陸資</option><option value="trust">投信</option><option value="dealer">自營商</option></select></label>
          <div className="toggle-group"><button className={rankSide === "buy" ? "active buy" : ""} onClick={() => setRankSide("buy")}>買超前五</button><button className={rankSide === "sell" ? "active sell" : ""} onClick={() => setRankSide("sell")}>賣超前五</button></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>排名</th><th>股票</th><th>代號</th><th>淨買賣超（股）</th><th>資料狀態</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={`${rankSide}-${i}`}><td><span className="rank-number">{i + 1}</span></td><td className="stock-name">{r.name}</td><td>{r.symbol}</td><td>{formatVolume(r.netShares)}</td><td>{r.market==="twse"?"上市 TWSE":"上櫃 TPEx"}</td></tr>)}
        </tbody></table></div>
        <p className="footnote"><CircleHelp size={14}/> {loadingRank ? "正在讀取法人日報…" : rankError || `資料日期 ${rankDate}；依淨買賣超股數排序，單位為股；盤後公布，非即時。`}</p>
      </section>

      <section className="section institutional-panel" id="five-day-institutional">
        <div className="section-heading"><div><div className="eyebrow">THREE-DAY INSTITUTIONAL FLOW</div><h2>三大法人連續 3 日買賣超</h2><p>依上方市場、法人及買賣方向同步篩選；以最近三個已公布交易日計算</p></div><span className="tag tag-amber">{fiveDates.length===3?fiveDates[2]+" ～ "+fiveDates[0]:"資料待確認"}</span></div>
        <div className="filters"><div className="toggle-group"><button className={fiveMode==="streak"?"active buy":""} onClick={()=>setFiveMode("streak")}>連續三日同方向</button><button className={fiveMode==="sum"?"active buy":""} onClick={()=>setFiveMode("sum")}>近三日累計</button></div><small style={{color:"#94a3b8"}}>正數＝買超；負數＝賣超；單位：股</small></div>
        <div className="table-wrap"><table><thead><tr><th>排名</th><th>股票</th><th>代號</th><th>三日淨買賣超（股）</th><th>三日逐日數據（新→舊）</th></tr></thead><tbody>
          {fiveRows.map((r,i)=><tr key={r.symbol}><td><span className="rank-number">{i+1}</span></td><td className="stock-name">{r.name}</td><td>{r.symbol}</td><td>{formatVolume(r.netShares)}</td><td style={{fontSize:14,lineHeight:1.6}}>{r.dailyShares.map(v=>v>0?"+"+formatVolume(v):formatVolume(v)).join(" / ")}</td></tr>)}
        </tbody></table></div>
        <p className="footnote"><CircleHelp size={14}/>{fiveLoading?"正在取得最近三個交易日資料…":fiveError||(!fiveRows.length?"符合條件的股票為 0 檔。":"資料來源：TWSE T86；盤後資料，非即時。")}</p>
      </section>

      </div>

      <section className="section" id="charts">
        <div className="section-heading"><div><div className="eyebrow">TECHNICAL ANALYSIS</div><h2>個股行情查詢</h2><p>盤中報價每 5 秒查詢；以有效成交價累積當日走勢，並非完整官方分時資料。</p></div><CandlestickChart size={26} className="heading-icon"/></div>
        <div className="chart-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入股票代號，例如 2330" onKeyDown={e => e.key === "Enter" && lookupStock()}/><button onClick={lookupStock}>查詢</button></div><span className="tag tag-amber">盤中走勢 · 5 秒查詢</span></div>
        <div className="chart-card"><div className="chart-title"><div><strong>{symbol}{stockData?.name ? ` · ${stockData.name}` : ""}</strong><span> · 盤中報價</span></div><span className="tag tag-amber">{stockData ? (loadingQuote ? "盤中行情 · 更新中" : quoteError ? "沿用前次報價" : "盤中行情（測試）") : loadingQuote ? "查詢中" : "尚無資料"}</span></div>
        {stockData ? (
          <>
            <div className="quote-summary"><div><small>最新成交價（元）</small><strong>{formatPrice(stockData.quote.close)}</strong></div><div><small>當日漲跌（元）</small><strong>{formatPrice(stockData.quote.change)}</strong></div><div><small>資料交易日</small><strong>{stockData.dataDate ?? "官方未提供"}</strong></div></div>
            <div className="indicator-grid"><div><small>開盤</small><strong>{formatPrice(stockData.quote.open)}</strong></div><div><small>最高</small><strong>{formatPrice(stockData.quote.high)}</strong></div><div><small>最低</small><strong>{formatPrice(stockData.quote.low)}</strong></div><div><small>成交量（股）</small><strong>{formatVolume(stockData.quote.volume)}</strong></div></div>
            <p className="footnote">來源：{stockData.dataSource}；查詢時間：{new Date(stockData.lastUpdatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台灣時間）。{ageLabel(stockData.delaySeconds)}，每 5 秒查詢，不保證即時；最新成功查詢：{quoteRefreshAt ? new Date(quoteRefreshAt).toLocaleTimeString("zh-TW", {timeZone:"Asia/Taipei"}) : "尚未取得"}。{quoteError ? "最新更新失敗："+quoteError+"；仍顯示前次成功報價。" : ""}</p>
          </>
        ) : <div className="chart-placeholder"><BarChart3 size={30}/><strong>{loadingQuote ? "正在讀取證交所資料…" : quoteError || "尚無行情資料"}</strong><span>目前僅支援上市股票日行情，上櫃股票與歷史 K 線尚未接通。</span></div>}
        <div className="history-panel"><h3>當日股價走勢圖</h3><IntradayChart points={stockPoints} reference={stockData?.quote.close!=null&&stockData.quote.change!=null?stockData.quote.close-stockData.quote.change:null}/><p className="footnote">每 5 秒查詢、按分鐘記錄有效成交價；僅保存目前瀏覽器本機的當日取樣。網頁關閉期間無法補齊資料，報價可能延遲；不是完整即時分時歷史圖。</p></div>
        </div>
        {message && <div className="notice" role="status">{message}</div>}
      </section>

      <section className="section" id="global">
        <div className="section-heading"><div><div className="eyebrow">GLOBAL INTELLIGENCE</div><h2>全球財經資訊</h2><p>全球指數、匯率、科技產業新聞與重要事件。</p></div><Globe2 size={26} className="heading-icon"/></div>
        <div className="news-grid">
          <article className="news-card"><span className="news-icon"><Globe2 size={19}/></span><div><strong>全球主要指數</strong><p>追蹤 S&P 500、NASDAQ、道瓊、日經與韓國 KOSPI。</p><small>全球行情 API 待設定</small></div></article>
          <article className="news-card"><span className="news-icon"><Newspaper size={19}/></span><div><strong>AI 與半導體</strong><p>整理 AI 伺服器、晶片、供應鏈與科技巨頭動態。</p><small>新聞來源待設定</small></div></article>
          <article className="news-card"><span className="news-icon"><Activity size={19}/></span><div><strong>匯率與大宗商品</strong><p>追蹤美元指數、台幣、黃金與原油等市場資訊。</p><small>行情來源待設定</small></div></article>
        </div>
      </section>

      <section className="membership" id="membership"><div><div className="eyebrow">MEMBERSHIP</div><h2>從基本資訊，到進階研究工具。</h2><p>規劃免費基本版與 Pro 會員方案。實際收費與付費權限需待金流和會員系統完成後啟用。</p></div><button className="btn btn-primary" onClick={() => setShowPlan(!showPlan)}>查看會員方案 <ArrowUpRight size={16}/></button>
        {showPlan && <div className="plan-detail"><h3>Pro 會員（規劃中）</h3><p>進階歷史排行、個股追蹤、技術指標與 AI 研究摘要。</p><span className="tag tag-amber">尚未開放訂閱或收款</span></div>}
      </section>

      <footer><a className="brand footer-brand" href="#"><span className="brand-mark brand-mark-custom"><img src="/ai-stock-lobster-logo.png" alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span><span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE</small></span></a><p>本網站為開發測試版。盤中行情與歷史技術分析均為測試功能；上櫃、新聞、部分法人資料及 AI 分析尚未完整串接，內容不構成投資建議。</p><span>© {new Date().getFullYear()} AI股市龍蝦</span></footer>
    </main>
  );
}
