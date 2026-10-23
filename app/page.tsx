"use client";

import lobsterLogo from "../ai_stock_lobster_logo.png";
import {useIntradayHistory} from "../lib/useIntradayHistory";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, CircleHelp, Globe2, Landmark, LockKeyhole, Menu, Newspaper, Search, ShieldCheck, TrendingUp, X } from "lucide-react";

type NewsRow={title:string;url:string;publishedAt:string|null;source:string;imageUrl:string|null;summary:string|null};
type RankRow = { symbol: string; name: string; netShares: number; market:"twse"|"tpex" };
type HistoryRow = { date:string; open:number; high:number; low:number; close:number; volume:number; ma5:number|null; ma10:number|null; ma20:number|null; ma60:number|null; rsi14:number|null; dif:number|null; signal:number|null; histogram:number|null };
type HistoryResult = { status:string; symbol:string; period:string; asOf:string; candles:HistoryRow[]; dataSource:string };
type TaiexResult = { status: string; date: string | null; value: number | null; change: number | null; changePercent: number | null; delaySeconds?: number | null; recent: { date: string | null; value: number | null }[] };
type CloseResult={status:string;date:string;value:number;change:number|null;tradeVolume:number|null;tradeValue:number|null;transactions:number|null;dataSource:string};
type NightResult={status:string;price:number;contract:string;quoteTime:string;delaySeconds:number;dataSource:string;isClosed?:boolean};
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
 const baseline=reference&&reference>0?reference:points[0]?.price??null;
 const x=(time:string)=>{const m=time.match(/(\d{2}):(\d{2})$/);if(!m)return 52;return 52+Math.max(0,Math.min(270,Number(m[1])*60+Number(m[2])-540))/270*716;};
 const y=(price:number)=>baseline?140-(price-baseline)/baseline*100*10.5:140;
 const path=points.map(p=>x(p.time).toFixed(1)+","+y(p.price).toFixed(1)).join(" ");
 return <div><svg viewBox="0 0 800 290" className="candle-svg" role="img" aria-label="個股盤中漲跌幅，縱軸固定正負百分之十，橫軸完整交易時段">
  {[10,5,0,-5,-10].map(pct=><g key={pct}><line x1="52" x2="768" y1={140-pct*10.5} y2={140-pct*10.5} stroke={pct===0?"#eab308":"#334155"} strokeDasharray="3 5"/><text x="5" y={144-pct*10.5} fontSize="12" fill="#94a3b8">{pct>0?"+":""}{pct}%</text></g>)}
  {points.length>1?<polyline points={path} fill="none" stroke="#fb725b" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>:points.length===1?<circle cx={x(points[0].time)} cy={y(points[0].price)} r="4" fill="#fb725b"/>:null}
  {["09:00","10:30","12:00","13:30"].map((time,i)=><text key={time} x={52+i*716/3} y="276" textAnchor={i===0?"start":i===3?"end":"middle"} fontSize="12" fill="#94a3b8">{time}</text>)}
 </svg><p className="footnote">{points.length?"最新取樣 "+points[points.length-1].time.slice(11)+" · "+formatPrice(points[points.length-1].price)+" 元":"尚無有效盤中報價"} · 固定 ±10% 漲跌幅；{reference?"以前收價為 0% 基準":"以前次有效取樣價為暫時基準"}</p></div>;
}

type Point={time:string;value:number;session:string;volume?:number|null};
function parts(iso:string){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));const v=(k:string)=>p.find(x=>x.type===k)?.value??"";return {date:v("year")+"-"+v("month")+"-"+v("day"),hour:Number(v("hour")),minute:Number(v("minute"))};}
function isTaiexSessionNow():boolean{
 const now=parts(new Date().toISOString());
 const day=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",weekday:"short"}).format(new Date());
 return day!=="Sat"&&day!=="Sun"&&now.hour*60+now.minute>=540&&now.hour*60+now.minute<=810;
}
function nightSessionKey(date:Date):string{
 const t=parts(date.toISOString());
 if(t.hour<15)return new Date(new Date(t.date+"T12:00:00+08:00").getTime()-86400000).toISOString().slice(0,10);
 return t.date;
}
function isNightTradingNow():boolean{
 const now=new Date(),t=parts(now.toISOString()),day=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",weekday:"short"}).format(now);
 return (["Mon","Tue","Wed","Thu","Fri"].includes(day)&&t.hour>=15)||(["Tue","Wed","Thu","Fri","Sat"].includes(day)&&t.hour<5);
}
function record(kind:"taiex"|"tx",iso:string,value:number):Point[]{
 const t=parts(iso),time=t.date+" "+String(t.hour).padStart(2,"0")+":"+String(t.minute).padStart(2,"0");
 const session=kind==="taiex"?t.date:nightSessionKey(new Date(iso));
 const key="lobster-minute-"+kind;
 try{const prev=JSON.parse(localStorage.getItem(key)||"[]") as Point[];const list=prev.filter(p=>p.session===session&&p.time!==time&&Number.isFinite(p.value));list.push({time,value,session});list.sort((a,b)=>a.time.localeCompare(b.time));const limited=list.slice(-900);localStorage.setItem(key,JSON.stringify(limited));return limited;}catch{return [{time,value,session}];}
}
function readPoints(kind:"taiex"|"tx"):Point[]{
 try{const raw=JSON.parse(localStorage.getItem("lobster-minute-"+kind)||"[]") as Point[];return Array.isArray(raw)?raw.filter(p=>Number.isFinite(p.value)&&typeof p.time==="string"):[];}catch{return [];}
}
function HourChart({points,base,session="day"}:{points:Point[];base:number|null;session?:"day"|"night"}){
 const start=session==="day"?540:900,duration=session==="day"?270:840;
 const ticks=session==="day"?["09:00","10:30","12:00","13:30"]:["15:00","19:00","23:00","01:00","05:00"];
 const minuteOf=(time:string)=>{const m=time.match(/(\d{2}):(\d{2})$/);if(!m)return null;let n=Number(m[1])*60+Number(m[2]);if(session==="night"&&n<900)n+=1440;return n;};
 const plot=points.flatMap(p=>{const minute=minuteOf(p.time);return minute===null||minute<start||minute>start+duration||!Number.isFinite(p.value)?[]:[{x:(minute-start)/duration*100,value:p.value,time:p.time}];});
 const values=plot.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values);
 const pad=values.length?Math.max((hi-lo)*0.10,hi*0.00015,3):100;
 const min=values.length?lo-pad:(base??0)-pad,max=values.length?hi+pad:(base??0)+pad;
 const y=(v:number)=>(max-v)/(max-min)*100;
 const poly=plot.map(p=>p.x.toFixed(2)+","+y(p.value).toFixed(2)).join(" ");
 const labels=Array.from({length:5},(_,i)=>max-(max-min)*i/4);
 return <div className="index-points-chart">
  <div className="index-points-title">實際點數 · 局部放大波動 <strong>{plot.length?formatPrice(plot[plot.length-1].value):"—"}</strong></div>
  <div className="index-points-main">
   <div className="index-points-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="指數點數走勢圖，右側為實際指數點數" style={{display:"block",width:"100%",height:"100%"}}>
    {labels.map((_,i)=><line key={i} x1="0" x2="100" y1={i*25} y2={i*25} stroke="#34455b" strokeDasharray="1 3" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>)}
    {base!=null&&base>=min&&base<=max?<line x1="0" x2="100" y1={y(base)} y2={y(base)} stroke="#d9ad55" strokeDasharray="2 2" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>:null}
    {plot.length>1?<polyline points={poly} fill="none" stroke="#fb725b" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>:plot.length===1?<circle cx={plot[0].x} cy={y(plot[0].value)} r="1.4" fill="#fb725b"/>:null}
   </svg>{!plot.length&&<span className="axis-waiting">尚無有效走勢資料</span>}</div>
   <div className="index-points-y">{labels.map((v,i)=><span key={i}>{formatPrice(v)}</span>)}</div>
  </div>
  <div className="axis-x-labels">{ticks.map(t=><span key={t}>{t}</span>)}</div>
  <div className="index-volume-title">{session==="night"?"成交量（口）":"成交量（股）"}</div>
  <div className="index-volume-empty">{session==="night"?"目前夜盤來源未提供可驗證的逐分鐘成交量（口），暫不繪製虛構量柱。":"目前行情 API 未提供可驗證的逐分鐘成交量，暫不繪製虛構量柱。上方另有證交所公布的總成交量。"}</div>
  <p className="footnote">以當日已取得的最高／最低點數局部放大，讓小幅波動也清楚；縱軸非從零起算，視覺振幅不代表漲跌百分比。每分鐘有效報價取樣，非完整歷史 K 線。</p>
 </div>;
}

function vixSentiment(v:number){
 if(v<12)return {label:"極度平靜／偏樂觀",detail:"預期波動極低，風險偏好可能較強，但也要留意市場過度自滿。",color:"#43c6a4"};
 if(v<15)return {label:"平靜／偏樂觀",detail:"市場預期波動偏低，整體情緒相對穩定。",color:"#7ed6a4"};
 if(v<20)return {label:"中性／正常波動",detail:"市場處於一般波動區間，沒有明顯的恐慌訊號。",color:"#a9c866"};
 if(v<25)return {label:"謹慎／輕度緊張",detail:"預期波動升高，投資人開始提高避險意識。",color:"#e9bd5a"};
 if(v<30)return {label:"警戒／明顯緊張",detail:"市場對不確定性的擔憂上升，短線震盪風險較高。",color:"#f1a45c"};
 if(v<40)return {label:"恐慌／高度避險",detail:"預期波動明顯偏高，市場避險需求通常較強。",color:"#ed7968"};
 return {label:"極度恐慌／劇烈波動",detail:"市場預期劇烈波動，應注意流動性與槓桿風險。",color:"#e65d73"};
}
function UsFuturesChart({points}:{points:{time:string;value:number}[]}){
 const valid=points.filter(p=>Number.isFinite(p.value)&&p.value>0);
 if(valid.length<2)return <div className="us-futures-empty">等待美股期貨有效歷史報價</div>;
 const min=Math.min(...valid.map(p=>p.value)),max=Math.max(...valid.map(p=>p.value)),pad=Math.max((max-min)*0.1,max*0.00015,1);
 const lower=min-pad,upper=max+pad;
 const coords=valid.map((p,i)=>((i/(valid.length-1))*100).toFixed(2)+","+((upper-p.value)/(upper-lower)*100).toFixed(2)).join(" ");
 const up=valid[valid.length-1].value>=valid[0].value;
 return <div className="us-futures-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="美股期貨最近可取得的五分鐘走勢">{[0,25,50,75,100].map(y=><line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#33455c" strokeWidth=".4" strokeDasharray="2 3" vectorEffect="non-scaling-stroke"/>)}<polyline points={coords} stroke={up?"#fb7969":"#42c4a5"} strokeWidth="2" fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg><div className="us-futures-axis"><span>{formatPrice(upper)}</span><span>{formatPrice(lower)}</span></div></div>;
}
function MarketMiniTrend({values,label}:{values:number[];label:string}){
 const valid=values.filter(v=>typeof v==="number"&&Number.isFinite(v)&&v>0);
 if(valid.length<2)return <div className="market-mini-trend missing">近五日走勢待更新</div>;
 const min=Math.min(...valid),max=Math.max(...valid),spread=Math.max(max-min,max*0.0001);
 const path=valid.map((v,i)=>`${(i/(valid.length-1)*116+2).toFixed(1)},${(33-(v-min)/spread*26).toFixed(1)}`).join(" ");
 const rising=valid[valid.length-1]>=valid[0],change=(valid[valid.length-1]/valid[0]-1)*100;
 return <div className="market-mini-trend"><svg viewBox="0 0 120 40" role="img" aria-label={label+" 最近 "+valid.length+" 個交易日收盤趨勢"} preserveAspectRatio="none">
  <line x1="0" y1="20" x2="120" y2="20" stroke="#32445a" strokeDasharray="2 4"/>
  <polyline points={path} fill="none" stroke={rising?"#f57563":"#45bfa4"} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
 </svg><span className={rising?"market-up":"market-down"}>{rising?"+":""}{change.toFixed(2)}% · {valid.length}日</span></div>;
}
export default function Home() {
  const [member,setMember]=useState<{name?:string|null;email?:string|null}|null>(null);
  const [memberLoading,setMemberLoading]=useState(true);
  const [loginProviders,setLoginProviders]=useState<{google?:boolean;apple?:boolean}>({});
  const [rankSide, setRankSide] = useState<"buy" | "sell">("buy");
  const [market, setMarket] = useState("twse");
  const [investor, setInvestor] = useState("all");
  const [vix,setVix]=useState<{value:number;change:number|null;quoteTime:string|null;source:string}|null>(null);
  const [vixError,setVixError]=useState("");
  const [usFutures,setUsFutures]=useState<{status:string;name:string;symbol:string;price:number;change:number|null;quoteTime:string|null;points:{time:string;value:number}[];source:string}|null>(null);
  const [usFuturesError,setUsFuturesError]=useState("");
  const [clockTick,setClockTick]=useState(0);
useEffect(()=>{
    let active=true;
    async function loadMember(){
      try{
        const [sessionResponse,providersResponse]=await Promise.all([fetch("/api/auth/session",{cache:"no-store"}),fetch("/api/auth/providers",{cache:"no-store"})]);
        const session=await sessionResponse.json();
        const providers=providersResponse.ok?await providersResponse.json():{};
        if(active){setMember(session?.user??null);setLoginProviders({google:Boolean(providers?.google),apple:Boolean(providers?.apple)});}
      }catch{if(active)setMember(null);}
      finally{if(active)setMemberLoading(false);}
    }
    void loadMember();return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{const response=await fetch("/api/market/vix",{signal:controller.signal});const result=await response.json();if(!response.ok||result.status!=="ok")throw new Error(result.error||"VIX 暫無資料");if(!controller.signal.aborted){setVix(result);setVixError("");}}
      catch(e){if(!controller.signal.aborted)setVixError(e instanceof Error?e.message:"VIX 讀取失敗");}
    }
    void load();const timer=setInterval(()=>{void load();},300000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  useEffect(()=>{
    const timer=setInterval(()=>setClockTick(v=>v+1),30000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch("/api/market/us-futures",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"美股期貨暫無行情");
        if(!controller.signal.aborted){setUsFutures(data);setUsFuturesError("");}
      }catch(e){if(!controller.signal.aborted)setUsFuturesError(e instanceof Error?e.message:"美股期貨暫無行情");}
    }
    void load();const timer=setInterval(()=>{void load();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch("/api/market/morning-brief",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"盤前分析暫不可用");
        if(!controller.signal.aborted){setMorningBrief(data);setMorningBriefError("");}
      }catch(e){if(!controller.signal.aborted)setMorningBriefError(e instanceof Error?e.message:"盤前分析暫不可用");}
    }
    if(!memberLoading&&member)void load();const timer=setInterval(()=>{if(member)void load();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[member,memberLoading]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch("/api/news/important",{signal:controller.signal});
        const data=await response.json();
        if(response.ok&&data.status==="ok"&&!controller.signal.aborted)setImportantNews(data.news??[]);
      }catch{}
    }
    void load();const timer=setInterval(()=>{void load();},180000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  const [dailyAnalysis,setDailyAnalysis]=useState<{date:string;generatedAt:string;source:string;marketView:string;asia:string;currency:string;risk:string;quotes:{symbol:string;label:string;value:number|null;changePct:number|null;trend5d:number[];trendDates:string[]}[]}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    let inFlight=false;
    async function load(){
      if(inFlight||document.visibilityState==="hidden")return;
      inFlight=true;
      try{const response=await fetch("/api/market/daily-analysis",{signal:controller.signal});const result=await response.json();if(response.ok&&result.status==="ok"&&!controller.signal.aborted)setDailyAnalysis(result);}
      catch{}
      finally{inFlight=false;}
    }
    void load();
    const timer=setInterval(()=>{void load();},15000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  const [stockPoints,setStockPoints]=useState<IntradayPoint[]>([]);
  const [stockNews,setStockNews]=useState<{title:string;url:string;source:string;publishedAt:string|null}[]>([]);
  const [stockNewsLoading,setStockNewsLoading]=useState(false);
  const [stockNewsError,setStockNewsError]=useState("");
  const [symbol, setSymbol] = useState("2330");
  const minuteHistory=useIntradayHistory(symbol);
  const displayedStockPoints=Array.from(new Map<string,IntradayPoint>([...minuteHistory.points,...stockPoints].filter(p=>p.date===parts(new Date().toISOString()).date&&Number.isFinite(p.price)).map(p=>[p.time,p] as const)).values()).sort((a,b)=>a.time.localeCompare(b.time));
  const [search, setSearch] = useState("");
  const [news, setNews] = useState<NewsRow[]>([]);
  const [importantNews,setImportantNews]=useState<NewsRow[]>([]);
  const [morningBrief,setMorningBrief]=useState<{reportDate:string;generatedAt:string;stance:string;sections:{title:string;body:string;sentiment:"bullish"|"bearish"|"neutral";verdict:string}[];method:string;isAfterDailyCutoff:boolean}|null>(null);
  const [morningBriefError,setMorningBriefError]=useState("");
  const [newsTab,setNewsTab]=useState<"all"|"important">("all");
  const [aiFlow,setAiFlow]=useState<{asOf:string;groups:{name:string;chain:string;turnover:number;stocks:{symbol:string;name:string;value:number}[]}[];volumeLeaders:{symbol:string;name:string;volume:number;value:number}[];buyers:{symbol:string;name:string;shares:number;volume:number}[];institutionalDate:string|null;note:string}|null>(null);
  const [aiFlowError,setAiFlowError]=useState("");
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
  const [indexHistory,setIndexHistory]=useState<Point[]>([]);
  const [nightPoints,setNightPoints]=useState<Point[]>([]);
  const [nightHistory,setNightHistory]=useState<Point[]>([]);
  const [nightHistorySource,setNightHistorySource]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    async function refreshNightHistory(){
      try{
        const res=await fetch("/api/market/taiex/night-history",{signal:controller.signal});
        const data=await res.json();
        if(res.ok&&data.status==="ok"&&!controller.signal.aborted){setNightHistory(data.points??[]);setNightHistorySource(data.source??"");}
      }catch{}
    }
    void refreshNightHistory();
    const timer=setInterval(()=>{void refreshNightHistory();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    async function refresh(){
      try{
        const response=await fetch("/api/market/taiex/intraday",{signal:controller.signal});
        const data=await response.json();
        if(response.ok&&data.status==="ok"&&!controller.signal.aborted)setIndexHistory(data.points??[]);
      }catch{}
    }
    void refresh();const timer=setInterval(()=>{void refresh();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);

  useEffect(()=>{
    setDayPoints(readPoints("taiex").filter(p=>p.session===parts(new Date().toISOString()).date));setNightPoints(readPoints("tx").filter(p=>p.session===nightSessionKey(new Date())));
    try{const saved=JSON.parse(localStorage.getItem("lobster-last-night")||"null") as NightResult|null;if(saved?.price&&saved.quoteTime&&nightSessionKey(new Date(saved.quoteTime))===nightSessionKey(new Date()))setNight({...saved,isClosed:!isNightTradingNow()});}catch{}
    try{
      const cached=JSON.parse(localStorage.getItem("lobster-last-taiex")||"null") as TaiexResult|null;
      if(cached?.status==="ok"&&cached.date===parts(new Date().toISOString()).date&&typeof cached.value==="number"){
        setTaiex(cached);setLoadingTaiex(false);
      }
    }catch{}
  },[]);
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

  useEffect(()=>{
    const controller=new AbortController();
    async function loadStockNews(){
      setStockNewsLoading(true);setStockNewsError("");
      try{
        const params=new URLSearchParams({symbol});
        if(stockData?.symbol===symbol&&stockData.name)params.set("name",stockData.name);
        const response=await fetch("/api/stocks/news?"+params.toString(),{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"新聞讀取失敗");
        if(!controller.signal.aborted)setStockNews(Array.isArray(data.news)?data.news:[]);
      }catch(e){if(!controller.signal.aborted){setStockNewsError(e instanceof Error?e.message:"新聞讀取失敗");setStockNews([]);}}
      finally{if(!controller.signal.aborted)setStockNewsLoading(false);}
    }
    void loadStockNews();
    const timer=setInterval(()=>{void loadStockNews();},300000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[symbol,stockData?.symbol,stockData?.name]);

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
        setTaiex(result as TaiexResult);setTaiexError("");
        try{localStorage.setItem("lobster-last-taiex",JSON.stringify(result));}catch{}
        if(typeof result.value==="number"&&typeof result.quoteTime==="string"){const t=parts(result.quoteTime);if((t.hour>=9&&t.hour<13)||(t.hour===13&&t.minute<=30))setDayPoints(record("taiex",result.quoteTime,result.value));}
      } catch (error) {
        if (!controller.signal.aborted) { setTaiex(null);setTaiexError(error instanceof Error ? error.message : "加權指數查詢失敗"); }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoadingTaiex(false);
      }
    }
    void loadIndex();
    const timer = setInterval(() => { if(isTaiexSessionNow())void loadIndex(); }, 1000);
    const offHoursTimer=setInterval(()=>{if(!isTaiexSessionNow())void loadIndex();},30000);
    return () => { controller.abort(); clearInterval(timer); clearInterval(offHoursTimer); };
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
        setNight({...data,isClosed:false});setNightError("");
        try{localStorage.setItem("lobster-last-night",JSON.stringify(data));}catch{}
        if(typeof data.price==="number"&&typeof data.quoteTime==="string")setNightPoints(record("tx",data.quoteTime,data.price));
      }catch(e){if(!controller.signal.aborted){setNight(prev=>prev?{...prev,isClosed:!isNightTradingNow()}:null);setNightError(e instanceof Error?e.message:"夜盤行情暫不可用");}}
      finally{inFlight=false;}
    }
    void loadNight();
    const timer=setInterval(()=>{void loadNight();},1000);
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
        setNews(data.news);setImportantNews(data.importantNews??[]);setNewsFetchedAt(new Date().toISOString());setNewsError("");
      }catch(e){if(!controller.signal.aborted){setNewsError(e instanceof Error?e.message:"新聞讀取失敗");setNews([]);}}
      finally{inFlight=false;}
    }
    void loadNews();
    const timer=setInterval(()=>{void loadNews();},300000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch("/api/market/ai-flow",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"AI 族群資料暫不可用");
        if(!controller.signal.aborted){setAiFlow(data);setAiFlowError("");}
      }catch(e){if(!controller.signal.aborted)setAiFlowError(e instanceof Error?e.message:"AI 族群資料暫不可用");}
    }
    void load();const timer=setInterval(()=>{void load();},300000);
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

  const showTaiwanNight=isNightTradingNow();
  const vixMood=vix?vixSentiment(vix.value):null;
  const currentIndexDay=parts(new Date().toISOString()).date;
  const nightChartPoints=Array.from(new Map<string,Point>([...nightHistory,...nightPoints].filter(p=>p.session===nightSessionKey(new Date())).map(p=>[p.time,p])).values()).sort((a,b)=>a.time.localeCompare(b.time));
  const indexChartPoints=Array.from(new Map<string,Point>([...indexHistory,...dayPoints].filter(p=>p.session===currentIndexDay).map(p=>[p.time,p])).values()).sort((a,b)=>a.time.localeCompare(b.time));
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="AI股市龍蝦首頁">
          <span className="brand-mark brand-mark-custom"><img src={lobsterLogo.src} alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span>
          <span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE · TAIWAN</small></span>
        </a>
        <nav className="nav-links"><a href="#rankings">法人排行</a><a href="#charts">個股走勢</a><a href="#global">全球資訊</a><a href="#membership">會員方案</a></nav>
        <button className="btn btn-outline login-btn" onClick={() => setShowLogin(!showLogin)}><LockKeyhole size={16}/> {member?"會員："+(member.name||member.email||"已登入"):"會員登入"}</button>
        <button className="icon-btn mobile-menu" aria-label="開啟登入面板" onClick={() => setShowLogin(!showLogin)}><Menu size={20}/></button>
      </header>

      {showLogin && <section className="modal-card">
        <button className="close-btn" onClick={() => setShowLogin(false)} aria-label="關閉"><X size={18}/></button>
        <h2>AI股市龍蝦會員</h2>
        {member?<><p>已登入：{member.name||member.email||"會員"}。可以閱讀每日 08:30 盤前分析。</p><button className="btn btn-secondary" onClick={()=>{void signOut({callbackUrl:"/"});}}>登出會員</button></>:<><p>使用 Google 或 Apple 帳號登入後，即可解鎖完整盤前分析。</p>
        {loginProviders.google&&<button className="btn btn-primary" onClick={()=>{void signIn("google",{callbackUrl:"/"});}}>使用 Google 登入</button>}
        {loginProviders.apple&&<button className="btn btn-secondary" onClick={()=>{void signIn("apple",{callbackUrl:"/"});}}>使用 Apple ID 登入</button>}
        {!loginProviders.google&&!loginProviders.apple&&<p>登入服務尚未完成設定，管理員需在 Vercel 設定 Google／Apple OAuth 金鑰。</p>}</>}
      </section>}

      <section className="section morning-brief" aria-label="每日八點半台股盤前分析" style={{margin:"20px 0 26px"}}>
        <div className="section-heading"><div><div className="eyebrow">DAILY TAIWAN MARKET BRIEF · 08:30</div><h2>每日 08:30 台股盤前分析</h2><p>涵蓋美股期貨、台指期、法人買賣、融資融券、期貨籌碼、匯率、VIX、技術面、重大政策與操作情境。</p></div><span className="tag tag-amber">台灣時間 08:30 起更新</span></div>
        {!memberLoading&&!member&&<div className="morning-brief-preview">
          <div className="morning-brief-grid morning-brief-preview-grid" aria-hidden="true">
            {["美股與期貨","外資與投信","融資融券","期貨與選擇權","匯率與利率","VIX 市場情緒","技術面與量能","重大政策與科技","今日盤前小總結"].map((title,i)=><article className="morning-brief-item morning-brief-preview-card" key={title}><h3>{String(i+1).padStart(2,"0")}　{title}</h3><div className="morning-brief-skeleton-line"/><div className="morning-brief-skeleton-line short"/><span className="morning-brief-skeleton-badge">會員專屬分析</span></article>)}
          </div>
          <div className="morning-brief-preview-overlay"><LockKeyhole size={30}/><h3>免費會員解鎖每日盤前分析</h3><p>九大板塊分析、利多利空判斷與盤前總結，登入後免費觀看。</p><div className="morning-brief-login-actions">{loginProviders.google&&<button className="btn btn-primary" onClick={()=>{void signIn("google",{callbackUrl:"/"});}}>使用 Google 登入</button>}{loginProviders.apple&&<button className="btn btn-secondary" onClick={()=>{void signIn("apple",{callbackUrl:"/"});}}>使用 Apple ID 登入</button>}{!loginProviders.google&&!loginProviders.apple&&<p>Google／Apple 登入尚待管理員完成 OAuth 設定。</p>}</div></div>
        </div>}
        {memberLoading&&<p className="footnote">正在確認會員登入狀態…</p>}
        {member&&morningBrief?<><div className="morning-brief-summary"><strong>{morningBrief.stance}</strong><span>分析日期 {morningBrief.reportDate} · 最新計算 {new Date(morningBrief.generatedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</span></div>
        <div className="morning-brief-grid">{morningBrief.sections.map((item,i)=><article key={item.title} className={"morning-brief-item morning-brief-"+item.sentiment}><div className="morning-brief-item-heading"><h3>{String(i+1).padStart(2,"0")}　{item.title}</h3><span className={"morning-brief-verdict "+item.sentiment}>{item.sentiment==="bullish"?"▲ ":item.sentiment==="bearish"?"▼ ":"● "}{item.verdict}</span></div><p>{item.body}</p></article>)}</div><p className="footnote">{morningBrief.method} · 08:30 後首次請求產生當日分析，之後定期檢查更新；非保證精準在 08:30 主動推送。</p></>:<p className="footnote">{morningBriefError||"正在整理盤前行情與籌碼資訊…"}</p>}
      </section>
      <section className="hero hero-balanced">
        <div className="hero-copy" style={{alignSelf:"stretch",display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:12}}>
          <div className="eyebrow"><span className="live-dot"></span> GLOBAL FINANCIAL NEWS · 多來源重要新聞</div>
          <h2 style={{fontSize:"clamp(24px,2.6vw,38px)",margin:"14px 0 6px"}}>全球即時財經快訊</h2>
          <p style={{margin:"0 0 12px",fontSize:13}}>一般新聞：富途牛牛；重要人士及台灣科技金融：Google 新聞彙整多家媒體 · 點擊閱讀來源</p><div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><button className="btn btn-secondary" onClick={()=>setNewsTab("all")} style={{opacity:newsTab==="all"?1:.65}}>全部財經快訊</button><button className="btn btn-secondary" onClick={()=>setNewsTab("important")} style={{opacity:newsTab==="important"?1:.65}}>重要人士發言／台灣科技金融 ({importantNews.length})</button></div>
          {(newsTab==="all"?news:importantNews).length>0 ? <div className="global-news-expanded" style={{display:"grid",gap:0,maxHeight:1000,minHeight:650,overflowY:"auto",paddingRight:8}}>
            {(newsTab==="all"?news:importantNews).slice(0,24).map((item,i)=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid #64748b33",color:"inherit",textDecoration:"none"}}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" style={{width:92,height:68,flexShrink:0,objectFit:"cover",borderRadius:8,background:"#1e293b"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div aria-hidden="true" style={{width:92,height:68,flexShrink:0,borderRadius:8,background:"#182437",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8"}}><Newspaper size={24}/></div>}
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:17,fontWeight:650,lineHeight:1.6}}><span style={{color:"#fb725b",marginRight:8}}>{String(i+1).padStart(2,"0")}</span>{item.title}</div>
                {item.summary && <p style={{fontSize:14,lineHeight:1.65,color:"#cbd5e1",margin:"5px 0 0",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.summary}</p>}
                <small style={{color:"#94a3b8",display:"block",marginTop:7,fontSize:13}}>{item.source} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"發布時間未提供"}</small>
              </div>
            </a>)}
          </div> : <div style={{padding:"22px 0",fontSize:14,color:"#94a3b8"}}>{newsError||(newsTab==="important"?"目前沒有符合分類條件的重要新聞，請稍後更新。":"正在載入富途牛牛財經新聞…")}</div>}
          <div style={{marginTop:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <a href="https://news.futunn.com/main" target="_blank" rel="noopener noreferrer" style={{color:"#fb725b",fontSize:14}}>前往富途牛牛查看最新新聞 ↗</a>
            <small style={{color:"#94a3b8"}}>{newsFetchedAt?"本站查詢："+new Date(newsFetchedAt).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei"}):"尚未成功更新"}</small>
          </div>
        <section className="holdings-panel" aria-label="AI熱門概念股產業資金熱度">
          <div className="holdings-heading"><span>AI 熱門概念股 · 產業資金熱度</span><small>CCL／PCB／先進封裝上下游</small></div>
          <div className="holdings-fund-title">今日 AI 供應鏈成交熱度 <span>{aiFlow?.asOf??"讀取中"} · 上市盤後資料</span></div>
          <p className="holdings-date">{aiFlow?.groups?.length?"成交金額最高："+aiFlow.groups[0].name+"（"+(aiFlow.groups[0].turnover/1e8).toFixed(1)+" 億元）":aiFlowError||"正在讀取證交所成交資料"}。成交金額是資金活躍度，並非買超淨流入。</p>
          {aiFlow?.groups?.slice(0,10).map(g=><div className="holdings-row" key={g.name}>
            <span className="holdings-name">{g.name}<small> {g.chain}</small></span>
            <div className="holdings-bar"><i style={{width:(g.turnover/Math.max(aiFlow.groups[0].turnover,1)*100).toFixed(1)+"%"}}/></div>
            <strong>{(g.turnover/1e8).toFixed(1)}億</strong>
          </div>)}
          <p className="footnote">分類採本站 AI 供應鏈觀察清單；不同族群可能共用成分股。僅比較各群成分股成交金額，不可視為資金淨流入排名。</p>
        </section>
        </div>
        <div className="hero-visual">
          <div className="visual-top"><span>MARKET FLOW</span><span className="tag tag-amber">{taiex ? "盤中行情測試資料" : loadingTaiex ? "載入中" : "暫無資料"}</span></div>
          <div className="visual-stat"><span>台股加權指數</span><strong>{formatPrice(taiex?.value)}</strong><small>{taiex ? `${taiex.date ?? "日期未提供"} · 漲跌 ${formatPrice(taiex.change)} 點（${formatPrice(taiex.changePercent)}%）· ${ageLabel(taiex.delaySeconds)} · 開盤每 1 秒查詢 · 不保證逐秒新報價` : loadingTaiex ? "載入盤中行情中…" : taiexError}</small></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,margin:"16px 0"}}>
            <div style={{padding:14,border:"1px solid #64748b55",borderRadius:12}}>
              <small>加權指數 · 最近收盤</small>
              <strong style={{display:"block",fontSize:24}}>{formatPrice(closing?.value)}</strong>
              <small>{closing ? `${closing.date} 收盤 · ${closing.dataSource}` : closingError || "讀取中"}</small>
            </div>
            <div style={{padding:14,border:"1px solid #64748b55",borderRadius:12}}>
              <small>臺股期貨 TX · {night?.isClosed?"最近有效夜盤報價（非官方收盤價）":"夜盤"}（不同於加權指數）</small>
              <strong style={{display:"block",fontSize:24}}>{formatPrice(night?.price)}</strong>
              <small>{night ? `${night.contract} · ${new Date(night.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})} · ${ageLabel(night.delaySeconds)} · 每 5 秒查詢` : nightError || "讀取中"}</small>
            </div>
          </div>
          <div className="market-volume-card">
            <div><small>上市市場 · 最近公布交易量</small><strong>{closing?.tradeVolume!=null?(closing.tradeVolume/1000).toLocaleString("zh-TW",{maximumFractionDigits:0})+" 張":"—"}</strong><small>{closing?closing.date+" · 全市場成交股數換算（1 張＝1,000 股）":closingError||"讀取中"}</small></div>
            <div><small>上市市場 · 成交金額</small><strong>{closing?.tradeValue!=null?(closing.tradeValue/100000000).toLocaleString("zh-TW",{maximumFractionDigits:2})+" 億元":"—"}</strong><small>{closing?closing.date+" · TWSE FMTQIK 官方盤後統計":"盤後資料尚未取得"}</small></div>
          </div>
          <p className="footnote">交易量與成交金額採證交所公布的上市市場每日統計；收盤後待官方資料更新才顯示當日總量。未更新前保留最近公布交易日與日期，不以盤中取樣冒充當日總量。</p>
          <div className="taiex-trend-heading">
            <span>加權指數 · 日盤點數走勢圖（開盤每秒查詢）</span>
            <span className={taiex?.change == null ? "taiex-live-change neutral" : taiex.change > 0 ? "taiex-live-change up" : taiex.change < 0 ? "taiex-live-change down" : "taiex-live-change neutral"}>
              目前漲跌 {taiex?.change == null ? "—" : (taiex.change > 0 ? "+" : "") + formatPrice(taiex.change) + " 點"}
              {taiex?.changePercent != null ? "（" + (taiex.changePercent > 0 ? "+" : "") + formatPrice(taiex.changePercent) + "%）" : ""}
            </span>
          </div>
          <div className="sparkline"><div className="spark-grid"></div><HourChart points={indexChartPoints} base={taiex?.value!=null&&taiex.change!=null?taiex.value-taiex.change:closing?.date!==taiex?.date?closing?.value??null:null}/></div>
          <p className="footnote">日盤 09:00～13:30，縱軸為實際指數點數；開盤每秒查詢，按分鐘保留最新有效報價；目前取得 {indexChartPoints.length} 筆。優先載入當日分鐘歷史，再合併盤中有效取樣；行情可能延遲。</p>
          {showTaiwanNight?<><div style={{fontWeight:700,fontSize:13,marginTop:12}}>台指期 TX 夜盤走勢圖（每秒查詢）</div>
          <div className="sparkline"><HourChart points={nightChartPoints} base={nightChartPoints[0]?.value??null} session="night"/></div>
          <p className="footnote">台灣時間 15:00～次日 05:00（交易日），縱軸為台指期點數；目前累積 {nightChartPoints.length} 筆。{nightHistorySource?nightHistorySource+"；":""}{nightError||"台指期行情依供應商更新，可能延遲。"}</p>
          {!nightChartPoints.length&&usFutures&&<div className="night-backup"><strong>台指期報價暫無資料 · 改顯示美股期貨參考</strong><div>{usFutures.name}：{formatPrice(usFutures.price)} 點</div><UsFuturesChart points={usFutures.points??[]}/><small>此為美股期貨，不是台指期。{usFutures.source}</small></div>}</>:<div className="night-backup"><strong>台指期夜盤尚未開盤 · 美股期貨行情</strong>
          {usFutures?<><div className="us-futures-price">{usFutures.name}：{formatPrice(usFutures.price)} 點 {usFutures.change!=null?"（"+(usFutures.change>0?"+":"")+formatPrice(usFutures.change)+"）":""}</div><UsFuturesChart points={usFutures.points??[]}/><p className="footnote">最近報價：{usFutures.quoteTime?new Date(usFutures.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"未提供"} · {usFutures.source} · 每分鐘查詢，非保證即時。美股期貨休市時顯示最近報價。</p></>:<p className="footnote">{usFuturesError||"正在讀取美股期貨行情"}；無可用報價時不會填入虛構數字。</p>}</div>}
          <div className="visual-bottom"><span><i className="dot dot-red"></i> 台股官方資料</span><span><i className="dot dot-blue"></i> 全球行情 API</span></div>

        </div>
      </section>

      <section className="section" aria-label="當日爆量與法人買超排行榜" style={{marginTop:24}}>
        <div className="section-heading"><div><div className="eyebrow">VOLUME & INSTITUTIONAL FLOW</div><h2>當日量能熱門股／法人積極買超</h2><p>以成交金額衡量當日市場關注度；以三大法人買超衡量機構買盤。大戶連續買進需要持股分級或連續多日資料，不能直接由法人單日買超推定。</p></div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:20}}>
          <div className="holdings-panel volume-leaders-panel"><div className="holdings-fund-title">當日成交金額 Top 10</div><p className="holdings-date">{aiFlow?.asOf??"等待資料"} · 上市個股盤後快照</p>
          {aiFlow?.volumeLeaders?.slice(0,10).map((x,i)=><div className="holdings-row" key={x.symbol}><span className="holdings-name">{i+1}. {x.name} <small>{x.symbol}</small></span><strong>{(x.value/1e8).toFixed(1)} 億</strong></div>)}
          {!aiFlow&&<p>{aiFlowError||"載入中…"}</p>}</div>
          <div className="holdings-panel volume-leaders-panel"><div className="holdings-fund-title">三大法人買超 Top 10</div><p className="holdings-date">資料日期：{aiFlow?.institutionalDate??"待確認"} · 買超股數，不等於大戶連買</p>
          {aiFlow?.buyers?.slice(0,10).map((x,i)=><div className="holdings-row" key={x.symbol}><span className="holdings-name">{i+1}. {x.name} <small>{x.symbol}</small></span><strong>+{(x.shares/1000).toLocaleString("zh-TW",{maximumFractionDigits:0})} 張</strong></div>)}
          {!aiFlow?.buyers?.length&&<p className="footnote">{aiFlowError||"法人當日資料尚未公布或未取得。"}</p>}</div>
        </div>
        <p className="footnote">資料：TWSE 公開資訊；每五分鐘檢查更新。若證交所尚未發布當日盤後資訊，資料可能是上一交易日，請依日期判讀。真正的「大戶持續狂買」須另外接入集保股權分散表、券商分點或多日法人紀錄。</p>
      </section>
          <div className="market-analysis-wide">          <div className="holdings-divider" />
          <div className="holdings-fund-title">今日台灣股市分析 <span>{dailyAnalysis?.date ?? "載入中"} · 國際市場／日韓股／新台幣</span></div>
          <p className="holdings-note">{dailyAnalysis?.marketView ?? "正在取得國際市場行情與今日台股分析…"}</p>
          <div className="daily-market-grid">{dailyAnalysis?.quotes.map(q=><div key={q.symbol} className="daily-market-quote"><small>{q.label}</small><strong>{q.value==null?"暫無資料":q.value.toLocaleString("zh-TW",{maximumFractionDigits:2})}</strong><span className={q.changePct==null?"":q.changePct>0?"market-up":"market-down"}>{q.changePct==null?"—":(q.changePct>0?"+":"")+q.changePct.toFixed(2)+"%"}</span><MarketMiniTrend values={q.trend5d??[]} label={q.label}/></div>)}</div>
          <p className="holdings-note"><b>日韓股影響：</b>{dailyAnalysis?.asia??"等待資料"}</p>
          <p className="holdings-note"><b>台幣升貶影響：</b>{dailyAnalysis?.currency??"等待資料"}</p>
          <p className="holdings-note"><b>今日觀察重點：</b>{dailyAnalysis?.risk??"等待資料"}</p>
          <p className="holdings-note">資料來源：{dailyAnalysis?.source??"讀取中"}。{dailyAnalysis?.generatedAt?"查詢時間："+new Date(dailyAnalysis.generatedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):""} · 每 5 分鐘查詢；行情可能延遲，分析為規則式研判，非即時交易建議。</p>
</div>

      <section className="vix-panel" aria-label="全球市場恐慌程度">
        <div className="section-heading"><div><div className="eyebrow">MARKET VOLATILITY</div><h2>全球市場恐慌指標 · VIX</h2><p>以美國 CBOE VIX 波動率指數觀察全球市場風險情緒，並非全球所有股市的綜合恐慌指數。</p></div></div>
        <div className="vix-content">
          <div className="vix-dial">
            <svg viewBox="0 0 300 185" role="img" aria-label={vix?"VIX "+vix.value.toFixed(2)+"，"+(vix.value<15?"低波動":vix.value<20?"一般":vix.value<30?"偏高":vix.value<40?"高度緊張":"極度緊張"):"VIX 資料暫無法取得"}>
              <path d="M 40 150 A 110 110 0 0 1 260 150" fill="none" stroke="#283649" strokeWidth="23" strokeLinecap="round"/>
              {[[0,0.25,"#3abf92"],[0.25,0.5,"#a2be57"],[0.5,0.75,"#e8ae4e"],[0.75,1,"#e66b5e"]].map(([from,to,color],i)=>{const theta1=Math.PI*(1-Number(from)),theta2=Math.PI*(1-Number(to));const x1=150+110*Math.cos(theta1),y1=150-110*Math.sin(theta1),x2=150+110*Math.cos(theta2),y2=150-110*Math.sin(theta2);return <path key={i} d={`M ${x1} ${y1} A 110 110 0 0 1 ${x2} ${y2}`} fill="none" stroke={String(color)} strokeWidth="19"/>;})}
              {vix&&<g transform={`rotate(${Math.min(1,Math.max(0,(vix.value-10)/40))*180-90} 150 150)`}><line x1="150" y1="150" x2="150" y2="51" stroke="#f7f9fc" strokeWidth="4" strokeLinecap="round"/><circle cx="150" cy="150" r="8" fill="#f7f9fc"/></g>}
              <text x="150" y="145" fill="#f1f5f9" fontSize="26" fontWeight="700" textAnchor="middle">{vix?vix.value.toFixed(2):"—"}</text>
              <text x="150" y="171" fill="#b8c7d9" fontSize="12" textAnchor="middle">VIX 指數</text>
              <text x="33" y="180" fill="#a2b3c8" fontSize="11">10</text><text x="256" y="180" fill="#a2b3c8" fontSize="11">50+</text>
            </svg>
          </div>
          <div className="vix-detail"><strong style={{color:vixMood?.color}}>{vixMood?.label??"等待行情"}</strong><p className="vix-conclusion">{vixMood?.detail??"尚未取得可驗證的 VIX 指數，暫不判斷市場情緒。"}</p>
            <p>{vix?"VIX 越高代表市場預期未來約 30 天的美股波動越大；高 VIX 不一定代表股市會下跌。":"尚無可驗證的 VIX 行情。"+(vixError?" "+vixError:"")}</p>
            <p>參考分級：低於 12 極度平靜、12–15 平靜、15–20 中性、20–25 謹慎、25–30 警戒、30–40 恐慌、40 以上極度恐慌。這是本站的解讀區間，非 CBOE 官方分級。</p>
            <small>來源：{vix?.source??"Yahoo Finance / CBOE VIX"} · {vix?.quoteTime?"報價時間 "+new Date(vix.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"報價時間待確認"} · 每 5 分鐘查詢，可能延遲；非逐秒即時</small>
          </div>
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
        <div className="stock-research-layout">
          <div className="history-panel"><h3>當日股價走勢圖</h3><IntradayChart points={displayedStockPoints} reference={stockData?.quote.close!=null&&stockData.quote.change!=null?stockData.quote.close-stockData.quote.change:null}/><p className="footnote">來源：{minuteHistory.source || "本機報價取樣"}。優先載入當日可取得的分鐘歷史資料，並合併本機每 5 秒查詢的有效報價；來源可能延遲或缺漏。</p></div>
          <aside className="stock-news-panel" aria-label="個股最新新聞">
            <div className="stock-news-heading"><h3>{stockData?.name||symbol} · 最新消息</h3><span>近 7 天 · 每 5 分鐘更新</span></div>
            {stockNewsLoading&&!stockNews.length?<p className="stock-news-empty">正在搜尋最新個股新聞…</p>:stockNewsError?<p className="stock-news-empty">{stockNewsError}</p>:stockNews.length?<div className="stock-news-list">{stockNews.map((article,i)=><a key={article.url+i} className="stock-news-item" href={article.url} target="_blank" rel="noopener noreferrer"><strong>{article.title}</strong><span>{article.source} · {article.publishedAt?new Date(article.publishedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"時間未提供"}</span></a>)}</div>:<p className="stock-news-empty">近 7 天未搜尋到相關新聞。</p>}
            <p className="footnote">來源：Google 新聞 RSS；最多顯示 30 則，依發布時間排序。新聞可能延遲、重複或遺漏，並非網路全部報導。</p>
          </aside>
        </div>
        </div>
        {message && <div className="notice" role="status">{message}</div>}
      </section>

      <section className="membership" id="membership"><div><div className="eyebrow">MEMBERSHIP</div><h2>從基本資訊，到進階研究工具。</h2><p>規劃免費基本版與 Pro 會員方案。實際收費與付費權限需待金流和會員系統完成後啟用。</p></div><button className="btn btn-primary" onClick={() => setShowPlan(!showPlan)}>查看會員方案 <ArrowUpRight size={16}/></button>
        {showPlan && <div className="plan-detail"><h3>Pro 會員（規劃中）</h3><p>進階歷史排行、個股追蹤、技術指標與 AI 研究摘要。</p><span className="tag tag-amber">尚未開放訂閱或收款</span></div>}
      </section>

      <footer><a className="brand footer-brand" href="#"><span className="brand-mark brand-mark-custom"><img src={lobsterLogo.src} alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span><span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE</small></span></a><p>本網站為開發測試版。盤中行情與歷史技術分析均為測試功能；上櫃、新聞、部分法人資料及 AI 分析尚未完整串接，內容不構成投資建議。</p><span>© {new Date().getFullYear()} AI股市龍蝦</span></footer>
    </main>
  );
}
