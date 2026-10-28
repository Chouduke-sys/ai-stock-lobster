"use client";

import lobsterLogo from "../ai_stock_lobster_logo.png";
import {useIntradayHistory} from "../lib/useIntradayHistory";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";

import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, CircleHelp, Globe2, Landmark, LockKeyhole, Menu, Newspaper, Search, ShieldCheck, TrendingUp, X, Home as HomeIcon, Layers3, Users, UserRound, Newspaper as NewsIcon } from "lucide-react";

// OAuth state cookies are host-bound. Always start OAuth on the canonical
// production hostname, even when someone opens a Vercel deployment alias.
const AUTH_ORIGIN = "https://ai-stock-lobster.vercel.app";
function startOAuth(provider: "google" | "apple") {
  if (window.location.origin !== AUTH_ORIGIN) {
    window.location.assign(AUTH_ORIGIN + "/?login=1");
    return;
  }
  void signIn(provider, {callbackUrl: "/"});
}

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
 const dayTicks=["09:00","10:30","12:00","13:30"];
 const minuteOf=(time:string)=>{const m=time.match(/(\d{2}):(\d{2})$/);if(!m)return null;let n=Number(m[1])*60+Number(m[2]);if(session==="night"&&n<900)n+=1440;return n;};
 const valid=points.flatMap(p=>{const minute=minuteOf(p.time);return minute===null||minute<start||minute>start+duration||!Number.isFinite(p.value)?[]:[{minute,value:p.value,time:p.time}];}).sort((a,b)=>a.minute-b.minute);
 // Match the daytime index chart's fixed, chronological X-axis geometry.
 // Night session runs 15:00–05:00 Taiwan time (crosses midnight).
 const rangeStart=start;
 const rangeEnd=start+duration;
 const plot=valid.map(p=>({x:(p.minute-rangeStart)/(rangeEnd-rangeStart)*100,value:p.value,time:p.time}));
 const ticks=session==="day"?dayTicks:["15:00","18:00","21:00","00:00","03:00","05:00"];
 const values=plot.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values);
 const pad=values.length?Math.max((hi-lo)*0.10,hi*0.00015,3):100;
 const min=values.length?lo-pad:(base??0)-pad,max=values.length?hi+pad:(base??0)+pad;
 const y=(v:number)=>(max-v)/(max-min)*100;
 const poly=plot.map(p=>p.x.toFixed(2)+","+y(p.value).toFixed(2)).join(" ");
 const labels=Array.from({length:5},(_,i)=>max-(max-min)*i/4);
 const precise=(v:number)=>v.toLocaleString("zh-TW",{minimumFractionDigits:2,maximumFractionDigits:2});
 const last=plot.length?plot[plot.length-1]:null;
 return <div className="index-points-chart">
  <div className="index-points-title">實際點數 · 局部放大波動 <strong>{last?precise(last.value):"—"}</strong></div>
  <div className="index-points-main">
   <div className="index-points-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="指數點數走勢圖，右側為實際指數點數" style={{display:"block",width:"100%",height:"100%"}}>
    {labels.map((_,i)=><line key={i} x1="0" x2="100" y1={i*25} y2={i*25} stroke="#34455b" strokeDasharray="1 3" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>)}
    {base!=null&&base>=min&&base<=max?<line x1="0" x2="100" y1={y(base)} y2={y(base)} stroke="#d9ad55" strokeDasharray="2 2" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>:null}
    {last&&plot.length>1?<line x1="0" x2="100" y1={y(last.value)} y2={y(last.value)} stroke="#7fa5c6" strokeDasharray="1 2" strokeWidth=".3" vectorEffect="non-scaling-stroke"/>:null}
    {plot.length>1?<polyline points={poly} fill="none" stroke="#fb725b" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>:plot.length===1?<circle cx={plot[0].x} cy={y(plot[0].value)} r="1.4" fill="#fb725b"/>:null}
    {last&&plot.length>1?<circle cx={last.x} cy={y(last.value)} r="1.1" fill="#fb725b" stroke="#fff" strokeWidth=".25"/>:null}
   </svg>{!plot.length&&<span className="axis-waiting">尚無有效走勢資料</span>}</div>
   <div className="index-points-y">{labels.map((v,i)=><span key={i}>{precise(v)}</span>)}</div>
  </div>
  <p className="footnote" style={{margin:"5px 0 0"}}>{last?"最後取樣 "+last.time.replace("T"," ")+" · "+precise(last.value)+" 點":"等待有效行情"} · 縱軸保留小數兩位，僅顯示來源實際提供的精度</p>
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
  const [isAdmin,setIsAdmin]=useState(false);
  useEffect(()=>{if(!member?.email){setIsAdmin(false);return;}let active=true;fetch("/api/admin/access",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(active)setIsAdmin(x.isAdmin===true);}).catch(()=>{});return()=>{active=false;};},[member?.email]);

  // Anonymous browser identifier; only its salted hash is persisted server-side.
  useEffect(()=>{
   let visitorId="";
   try{visitorId=localStorage.getItem("lobster-anon-visitor")??"";if(!/^[a-f0-9-]{16,64}$/i.test(visitorId)){visitorId=crypto.randomUUID();localStorage.setItem("lobster-anon-visitor",visitorId);}}catch{return;}
   void fetch("/api/analytics/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"page_view",visitorId}),keepalive:true}).catch(()=>{});
  },[]);
  useEffect(()=>{
   if(!member?.email)return;
   let visitorId="";try{visitorId=localStorage.getItem("lobster-anon-visitor")??"";}catch{return;}
   if(!visitorId)return;
   // Record an authenticated view only when the member actually opens the nine-factor section.
   const target=document.querySelector('[aria-label="每日八點半台股盤前分析"]');
   if(!target)return;
   let sent=false;
   const observer=new IntersectionObserver(entries=>{
    if(sent||!entries.some(e=>e.isIntersecting))return;
    sent=true;observer.disconnect();
    void fetch("/api/analytics/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"morning_brief_view",visitorId}),keepalive:true}).catch(()=>{});
   },{threshold:0.2});
   observer.observe(target);return()=>observer.disconnect();
  },[member?.email]);

  const [loginProviders,setLoginProviders]=useState<{google?:boolean;apple?:boolean;"email-code"?:boolean}>({});
  const [emailLogin,setEmailLogin]=useState("");
  const [emailCode,setEmailCode]=useState("");
  const [emailSent,setEmailSent]=useState(false);
  const [emailBusy,setEmailBusy]=useState(false);
  const [emailError,setEmailError]=useState("");
  async function emailLoginAction(action:"send"|"verify"){
    if(emailBusy)return;setEmailBusy(true);setEmailError("");
    try{
      const r=await fetch("/api/auth/email-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,email:emailLogin,code:emailCode})});
      const data=await r.json();if(!r.ok)throw new Error(data.error??"驗證失敗");
      if(action==="send"){setEmailSent(true);setEmailCode("");}
      else{const result=await signIn("email-code",{accessToken:data.accessToken,redirect:false,callbackUrl:"/"});if(result?.error)throw new Error("登入驗證失敗");window.location.reload();}
    }catch(e){setEmailError(e instanceof Error?e.message:"操作失敗");}finally{setEmailBusy(false);}
  }
  const [rankSide, setRankSide] = useState<"buy" | "sell">("buy");
  const [market, setMarket] = useState("twse");
  const [investor, setInvestor] = useState("all");
  const [ftse,setFtse]=useState<{price:number;change:number;changePercent:number;quoteTime:string|null;delayMinutes:number|null;source:string;isStale?:boolean}|null>(null);
  const [ftseError,setFtseError]=useState("");
  const [positioning,setPositioning]=useState<{status:string;institutional:{label:string;values:string[]}[];margin:{label:string;values:string[]}[];futures:{label:string;values:string[]}[];retrievedAt:string;liveInstitutional?:{date:string;foreignYi:number;trustYi:number;dealerYi:number;totalYi:number;unit:string;source:string}|null}|null>(null);
  const [positioningError,setPositioningError]=useState("");
  useEffect(()=>{let active=true;const load=async()=>{try{const res=await fetch("/api/market/taiwan-positioning",{cache:"no-store"});const data=await res.json();if(!res.ok||data.status!=="ok")throw new Error(data.error||"資料暫不可用");if(active){setPositioning(data);setPositioningError("");}}catch(e){if(active)setPositioningError(e instanceof Error?e.message:"資料暫不可用");}};void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},60000);return()=>{active=false;clearInterval(timer);};},[]);

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const response=await fetch("/api/market/ftse-taiwan",{cache:"no-store"});
        const data=await response.json();
        if(!response.ok||data.status!=="ok")throw new Error(data.error||"報價暫不可用");
        if(active){setFtse(data);setFtseError("");}
      }catch(e){if(active){setFtse(null);setFtseError(e instanceof Error?e.message:"報價暫不可用");}}
    }
    void load();const timer=setInterval(()=>{void load();},60000);
    return ()=>{active=false;clearInterval(timer);};
  },[]);
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
        if(active){setMember(session?.user??null);setLoginProviders({google:Boolean(providers?.google),apple:Boolean(providers?.apple),"email-code":Boolean(providers?.["email-code"])});}
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
  const [weekCalendar,setWeekCalendar]=useState<{monday:string;friday:string;events:{date:string;time:string;title:string;level:string;region:string;detail:string}[];status:string}|null>(null);
  useEffect(()=>{let active=true;async function load(){try{const r=await fetch("/api/market/week-calendar");const d=await r.json();if(active)setWeekCalendar(d);}catch{if(active)setWeekCalendar(null);}}void load();const timer=setInterval(()=>void load(),3600000);return()=>{active=false;clearInterval(timer);};},[]);
  const [morningBrief,setMorningBrief]=useState<{reportDate:string;generatedAt:string;stance:string;recommendedAllocation:number|null;sections:{title:string;body:string;sentiment:"bullish"|"bearish"|"neutral";verdict:string}[];method:string;isAfterDailyCutoff:boolean}|null>(null);
  const [morningBriefError,setMorningBriefError]=useState("");
  const [dailyReview,setDailyReview]=useState<{latest:{date:string;prediction:string;predictionLabel:string;outcome:null|{changePct:number;actual:string;correct:boolean}}[];metrics:{days30:{evaluated:number;rate:number|null};days90:{evaluated:number;rate:number|null}};method:string}|null>(null);
  useEffect(()=>{let cancelled=false;fetch("/api/market/daily-review").then(r=>r.ok?r.json():null).then(data=>{if(!cancelled&&data?.status==="ok")setDailyReview(data);}).catch(()=>{});return()=>{cancelled=true;};},[]);
  
  const [newsTab,setNewsTab]=useState<"all"|"important">("all");
  const [aiFlow,setAiFlow]=useState<{asOf:string;radar?:{hottest:{name:string;turnover:number;weeklyDelta:number|null;turnoverShare:number|null}[];emerging:{name:string;turnover:number;weeklyDelta:number|null;shareDelta:number|null;medianPriceMove:number|null}[];cooling:{name:string;turnover:number;weeklyDelta:number|null;shareDelta:number|null;medianPriceMove:number|null}[]};groups:{name:string;chain:string;turnover:number;weeklyChange:number|null;weeklyDelta:number|null;turnoverShare:number|null;leaderShare:number|null;historicalQuality:string;risingSessions:number|null;shareDelta:number|null;medianPriceMove:number|null;breadth:number|null;radarStatus:string;historyDays:number;historyDate:string|null;stocks:{symbol:string;name:string;value:number}[]}[];volumeLeaders:{symbol:string;name:string;volume:number;value:number}[];buyers:{symbol:string;name:string;shares:number;volume:number}[];institutionalDate:string|null;note:string}|null>(null);
  const [aiFlowError,setAiFlowError]=useState("");
  const [leaderNews,setLeaderNews]=useState<{symbol:string;name:string;title:string;url:string;publishedAt:string|null;source:string}[]>([]);
  const [leaderNewsError,setLeaderNewsError]=useState("");
  const leaderKey=aiFlow?.volumeLeaders?.slice(0,10).map(x=>x.symbol+":"+x.name).join(",")??"";
  useEffect(()=>{
    if(!leaderKey){setLeaderNews([]);return;}
    const controller=new AbortController();
    const load=async()=>{try{
      const response=await fetch("/api/market/volume-leader-news?stocks="+encodeURIComponent(leaderKey),{signal:controller.signal});
      const data=await response.json();
      if(!response.ok||data.status!=="ok")throw new Error(data.error||"新聞資料暫不可用");
      if(!controller.signal.aborted){setLeaderNews(data.items??[]);setLeaderNewsError("");}
    }catch(e){if(!controller.signal.aborted)setLeaderNewsError(e instanceof Error?e.message:"新聞資料暫不可用");}};
    void load();const timer=setInterval(()=>void load(),600000);
    return()=>{controller.abort();clearInterval(timer);};
  },[leaderKey]);

  const [sectorHistory,setSectorHistory]=useState<{date:string;groups:{name:string;turnover:number}[]}[]>([]);
  useEffect(()=>{
    try{const saved=JSON.parse(localStorage.getItem("lobster-sector-turnover-history-v1")||"[]") as {date:string;groups:{name:string;turnover:number}[]}[];if(Array.isArray(saved))setSectorHistory(saved.slice(-25));}catch{}
  },[]);
  useEffect(()=>{
    if(!aiFlow?.groups?.length)return;
    const date=aiFlow.asOf;
    if(!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(date))return;
    setSectorHistory(previous=>{
      const snapshot={date,groups:aiFlow.groups.map(g=>({name:g.name,turnover:g.turnover}))};
      const next=[...previous.filter(x=>x.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)).slice(-25);
      try{localStorage.setItem("lobster-sector-turnover-history-v1",JSON.stringify(next));}catch{}
      return next;
    });
  },[aiFlow]);
  const [newsError, setNewsError] = useState("");
  const [newsFetchedAt, setNewsFetchedAt] = useState<string|null>(null);
  const [showLogin, setShowLogin] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("login") === "1") {
      setShowLogin(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);
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
  const [trendRange,setTrendRange]=useState<"live"|"1d"|"2d"|"3d">("live");
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

  const [mobileTab,setMobileTab]=useState<"news"|"market"|"sectors"|"index"|"flows"|"charts"|"account">("news");
  const selectMobileTab=(tab:typeof mobileTab)=>{setMobileTab(tab);window.scrollTo({top:0,behavior:"instant"});};
  const showTaiwanNight=isNightTradingNow();
  const vixMood=vix?vixSentiment(vix.value):null;
  const currentIndexDay=parts(new Date().toISOString()).date;
  const nightChartPoints=Array.from(new Map<string,Point>([...nightHistory,...nightPoints].filter(p=>p.session===nightSessionKey(new Date())).map(p=>[p.time,p])).values()).sort((a,b)=>a.time.localeCompare(b.time));
  const indexChartPoints=Array.from(new Map<string,Point>([...indexHistory,...dayPoints].filter(p=>p.session===currentIndexDay).map(p=>[p.time,p])).values()).sort((a,b)=>a.time.localeCompare(b.time));
  return (
    <main className="site-shell" data-mobile-tab={mobileTab}>
      <header className="topbar">
        <a className="brand" href="#" aria-label="AI股市龍蝦首頁">
          <span className="brand-mark brand-mark-custom"><img src={lobsterLogo.src} alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span>
          <span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE · TAIWAN</small></span>
        </a>
        <nav className="nav-links" aria-label="電腦版主要功能"><a href="#desktop-news">新聞</a><a href="#desktop-market">今日台股</a><a href="#desktop-index">加權指數</a><a href="#desktop-flows">法人籌碼</a><a href="#desktop-sectors">熱門產業</a><a href="#charts">個股分析</a><a href="#membership">會員</a></nav>
        <button className="btn btn-outline login-btn" onClick={() => setShowLogin(!showLogin)}><LockKeyhole size={16}/> {member?"會員："+(member.name||member.email||"已登入"):"會員登入"}</button>
        <button className="icon-btn mobile-menu" aria-label="開啟登入面板" onClick={() => setShowLogin(!showLogin)}><Menu size={20}/></button>
      </header>

      {showLogin && <section className="modal-card">
        <button className="close-btn" onClick={() => setShowLogin(false)} aria-label="關閉"><X size={18}/></button>
        <h2>AI股市龍蝦會員</h2>
        {member?<><p>已登入：{member.name||member.email||"會員"}。可以閱讀每日 08:30 盤前分析。{isAdmin&&<a href="/admin" className="btn btn-primary" style={{marginLeft:12}}>🦞 管理者後台</a>}</p><button className="btn btn-secondary" onClick={()=>{void signOut({callbackUrl:"/"});}}>登出會員</button></>:<><p>使用 Google 或 Email 驗證碼登入，即可解鎖會員內容。</p>
        {loginProviders.google&&<button className="btn btn-primary" onClick={()=>{startOAuth("google");}}>🔵 使用 Google 登入</button>}
        {loginProviders["email-code"]&&<div style={{display:"grid",gap:10,marginTop:14,maxWidth:390}}>
          <label htmlFor="lobster-email">✉️ 使用 Email 驗證碼登入</label>
          <input id="lobster-email" type="email" autoComplete="email" placeholder="輸入電子郵件" value={emailLogin} onChange={e=>{setEmailLogin(e.target.value);setEmailSent(false);}} style={{padding:12,borderRadius:8,border:"1px solid #49617a",background:"#0d1b2c",color:"#fff",width:"100%"}}/>
          {emailSent&&<input aria-label="Email 驗證碼" inputMode="numeric" autoComplete="one-time-code" placeholder="輸入收到的驗證碼" value={emailCode} onChange={e=>setEmailCode(e.target.value)} style={{padding:12,borderRadius:8,border:"1px solid #49617a",background:"#0d1b2c",color:"#fff",width:"100%"}}/>}
          <button className="btn btn-secondary" disabled={emailBusy||!emailLogin} onClick={()=>void emailLoginAction(emailSent?"verify":"send")}>{emailBusy?"處理中…":emailSent?"驗證並登入":"✉️ 寄送驗證碼"}</button>
          {emailSent&&<button className="btn btn-secondary" disabled={emailBusy} onClick={()=>void emailLoginAction("send")}>重新寄送驗證碼</button>}
          {emailError&&<p role="alert" style={{color:"#fca5a5"}}>{emailError}</p>}
        </div>}
        {!loginProviders.google&&!loginProviders["email-code"]&&<p>登入服務尚未完成設定。</p>}</>}
      </section>}

      <section className="section morning-brief" aria-label="每日八點半台股盤前分析" style={{margin:"20px 0 26px"}}>
        <div className="section-heading"><div><div className="eyebrow">DAILY TAIWAN MARKET BRIEF · 08:30</div><h2>每日 08:30 台股盤前分析</h2><p>涵蓋美股期貨、台指期、法人買賣、融資融券、期貨籌碼、匯率、VIX、技術面、重大政策與操作情境。</p></div><span className="tag tag-amber">台灣時間 08:30 起更新</span></div>
        {!memberLoading&&!member&&<div className="morning-brief-preview">
          <div className="morning-brief-grid morning-brief-preview-grid" aria-hidden="true">
            {["美股與期貨","外資與投信","融資融券","期貨與選擇權","匯率與利率","VIX 市場情緒","技術面與量能","重大政策與科技","今日盤前小總結"].map((title,i)=><article className="morning-brief-item morning-brief-preview-card" key={title}><h3>{String(i+1).padStart(2,"0")}　{title}</h3><div className="morning-brief-skeleton-line"/><div className="morning-brief-skeleton-line short"/><span className="morning-brief-skeleton-badge">會員專屬分析</span></article>)}
          </div>
          <div className="morning-brief-preview-overlay"><LockKeyhole size={30}/><h3>免費會員解鎖每日盤前分析</h3><p>九大板塊分析、利多利空判斷與盤前總結，登入後免費觀看。</p><div className="morning-brief-login-actions">{loginProviders.google&&<button className="btn btn-primary" onClick={()=>{startOAuth("google");}}>使用 Google 登入</button>}{loginProviders.apple&&<button className="btn btn-secondary" onClick={()=>{startOAuth("apple");}}>使用 Apple ID 登入</button>}{!loginProviders.google&&!loginProviders.apple&&<p>Google／Apple 登入尚待管理員完成 OAuth 設定。</p>}</div></div>
        </div>}
        {memberLoading&&<p className="footnote">正在確認會員登入狀態…</p>}
        {member&&morningBrief?<><div className="morning-brief-summary"><div style={{display:"grid",gap:5,minWidth:0}}><strong>{morningBrief.stance}</strong><small style={{fontSize:12,lineHeight:1.6,color:"#c7d9ed",maxWidth:610}}>{(()=>{const bull=morningBrief.sections.filter(x=>x.sentiment==="bullish").length;const bear=morningBrief.sections.filter(x=>x.sentiment==="bearish").length;const neutral=morningBrief.sections.length-bull-bear;return `九大面向：利多 ${bull}／利空 ${bear}／中性 ${neutral}。${bull>bear?"多方訊號略占優勢，但仍須觀察量能與法人動向。":bear>bull?"空方訊號略占優勢，建議留意開盤後承接與風險控管。":"多空訊號相近，方向尚未明朗，先觀察量能與法人動向。"}${typeof morningBrief.recommendedAllocation==="number"?" 建議倉位上限 "+Math.min(90,Math.max(0,morningBrief.recommendedAllocation))+"%。":""}`;})()}</small></div><small className="morning-brief-allocation">建議股票總倉水位：{typeof morningBrief.recommendedAllocation==="number"?Math.min(90,Math.max(0,morningBrief.recommendedAllocation))+"%":"回測資料取得中"}</small><span>分析日期 {morningBrief.reportDate} · 最新計算 {new Date(morningBrief.generatedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</span></div>
        <div className="morning-brief-grid">{morningBrief.sections.map((item,i)=><article key={item.title} className={"morning-brief-item morning-brief-"+item.sentiment}><div className="morning-brief-item-heading"><h3>{String(i+1).padStart(2,"0")}　{item.title}</h3><span className={"morning-brief-verdict "+item.sentiment}>{item.sentiment==="bullish"?"▲ ":item.sentiment==="bearish"?"▼ ":"● "}{item.verdict}</span></div><p>{item.body}</p></article>)}</div><p className="footnote">{morningBrief.method} · 08:30 後首次請求產生當日分析，之後定期檢查更新；非保證精準在 08:30 主動推送。</p></>:<p className="footnote">{morningBriefError||"正在整理盤前行情與籌碼資訊…"}</p>}
      </section>
      <section className="section sector-rotation-member" aria-label="會員產業資金輪動觀察">
        <div className="section-heading"><div><div className="eyebrow">SECTOR CAPITAL ROTATION · 產業資金輪動</div><h2>產業資金輪動-資金流入與退燒追蹤</h2><p>比較不同產業成交金額與歷史變化，觀察 PCB、記憶體、散熱及其他族群的交易熱度。</p></div></div>
        {member ? <>
        <p className="footnote">使用證交所近週歷史交易日成交金額，比較最新一日與先前交易日均值；歷史資料不足時維持灰色，不以瀏覽器快照替代官方歷史趨勢。成交金額變化代表交易熱度，不等於資金淨流入。</p>
        <div className="sector-radar-grid">
          {([{key:"hottest",title:"現在最熱的是誰？",description:"近一交易日成交金額最高的三大產業",empty:"歷史資料不足，暫不排名"},{key:"emerging",title:"下一個可能輪到誰？",description:"成交熱度連續增強、占比上升且價格漲幅尚不明顯",empty:"目前沒有符合全部條件的產業"},{key:"cooling",title:"誰正在退燒？",description:"短線賣壓升高：成交金額與市場占比下降，且代表股價格走弱",empty:"目前沒有符合全部條件的產業"}] as const).map(panel=><div className="sector-radar-panel" key={panel.key}><h3>{panel.title}</h3><p>{panel.description}</p>{aiFlow?.radar?.[panel.key]?.length?aiFlow.radar[panel.key].map((item,i)=><div className="sector-radar-entry" key={item.name}><strong>{i+1}. {item.name}{panel.key==="cooling"?" 🔴 短線賣壓升高":""}</strong><span>{(item.turnover/1e8).toFixed(1)} 億 · {item.weeklyDelta===null?"趨勢待確認":(item.weeklyDelta>=0?"+":"")+(item.weeklyDelta/1e8).toFixed(1)+" 億"}</span>{panel.key==="cooling"&&<small style={{display:"block",marginTop:4}}>短線賣壓升高，成交熱度與市場占比下降、代表股價格偏弱；不代表長期趨勢結束。觀察量縮止跌及法人賣壓是否減輕。</small>}</div>):<small>{panel.empty}</small>}</div>)}
        </div>
        <div className="sector-rotation-legend" aria-label="產業成交熱度變化顏色說明"><span className="rotation-fast-in">紅色｜快速集中</span><span className="rotation-slow-in">橘色｜緩慢增加</span><span className="rotation-slow-out">黃色｜緩慢減少</span><span className="rotation-fast-out">綠色｜快速減少</span><span className="rotation-unknown">灰色｜資料不足</span></div>
        <p className="footnote">判讀門檻：最新成交金額相較近週前幾日均值，增加至少 50 億為快速集中、增加未滿 50 億為緩慢增加；減少未滿 50 億為緩慢減少、減少至少 50 億為快速減少。依成交金額增減億元排名，而非百分比。這是交易熱度變化，不代表實際資金淨流入或流出。</p>
        <div className="sector-rotation-list">
          {aiFlow?.groups?.map((g,i)=>{
            const older=sectorHistory.filter(h=>h.date!==aiFlow.asOf&&h.groups.some(x=>x.name===g.name)).slice(-1)[0];
            const prior=older?.groups.find(x=>x.name===g.name)?.turnover;
            const delta=typeof g.weeklyDelta==="number"?g.weeklyDelta:null;
            const deltaYi=delta===null?null:delta/1e8;
            // Absolute TWD turnover change; percentage is not used for status or rank.
            const rotationClass=deltaYi===null?"rotation-unknown":deltaYi>=50?"rotation-fast-in":deltaYi>0?"rotation-slow-in":deltaYi<=-50?"rotation-fast-out":"rotation-slow-out";
            const rotationLabel=deltaYi===null?"資料不足":deltaYi>=50?"資金快速集中":deltaYi>0?"資金緩慢流入":deltaYi<=-50?"資金快速流出":"資金緩慢流出";
            return <article className={"sector-rotation-row "+rotationClass} key={g.name}>
              <div><strong>{i+1}. {g.name}</strong><small>{g.chain} · {g.stocks.slice(0,3).map(x=>x.name).join("、")}</small></div>
              <div><span className={"rotation-status "+rotationClass}>{rotationLabel}</span><strong>{(g.turnover/1e8).toFixed(1)} 億</strong><small>{typeof g.turnoverShare==="number"?"市場成交占比 "+g.turnoverShare.toFixed(1)+"% · ":""}{typeof g.leaderShare==="number"?"最大成分股占族群 "+g.leaderShare.toFixed(0)+"% · ":""}{deltaYi===null?"歷史資料累積中":(deltaYi>0?"+":"")+deltaYi.toFixed(1)+" 億（"+(typeof g.weeklyDelta==="number"?"較近週前幾日均值":"較 "+older?.date)+"）"}</small></div>
            </article>;
          })}
          {!aiFlow?.groups?.length&&<p>{aiFlowError||"正在取得證交所產業成交資料…"}</p>}
        </div>
        <p className="footnote">目前觀察族群依本站既有 AI 供應鏈清單分類，並非全市場所有產業。記憶體及其他產業將逐步補齊；單日漲跌與成交金額變動無法證明產業間存在直接資金轉移。</p>
        </> : <p className="footnote"><LockKeyhole size={15} style={{verticalAlign:"middle"}}/> 登入後與每日 08:30 台股盤前分析一同解鎖，無需再次登入。</p>}
      </section>
      <section className="section sector-rotation-member" aria-label="會員 AI 盤後檢討">
        <div className="section-heading"><div><div className="eyebrow">AI DAILY REVIEW · 預測績效追蹤</div><h2>AI 盤後檢討</h2><p>保留每日盤前方向快照，與當日證交所正式收盤結果核對，不回填事後預測。</p></div></div>
        {member?<><div className="sector-radar-grid"><div className="sector-radar-panel"><h3>近 30 個已驗證交易日</h3><strong>{dailyReview?.metrics.days30.rate==null?"累積中":dailyReview.metrics.days30.rate.toFixed(1)+"%"}</strong><p>已驗證 {dailyReview?.metrics.days30.evaluated??0} 日</p></div><div className="sector-radar-panel"><h3>近 90 個已驗證交易日</h3><strong>{dailyReview?.metrics.days90.rate==null?"累積中":dailyReview.metrics.days90.rate.toFixed(1)+"%"}</strong><p>已驗證 {dailyReview?.metrics.days90.evaluated??0} 日</p></div><div className="sector-radar-panel"><h3>驗證方式</h3><p>盤前偏多／偏空／中性，對照當日加權指數漲跌；尚未累積的交易日不計入勝率。</p></div></div><div className="sector-radar-panel">{dailyReview?.latest.length?dailyReview.latest.map(day=><div className="sector-radar-entry" key={day.date}><strong>{day.date}　盤前：{day.predictionLabel}</strong><span>{day.outcome?"盤後："+(day.outcome.changePct>=0?"+":"")+day.outcome.changePct.toFixed(2)+"%　"+(day.outcome.correct?"方向符合":"方向未符合"):"盤後結果待驗證"}</span></div>):<p>歷史預測尚未累積。首次排程成功執行後，才會開始顯示可核對的紀錄。</p>}</div><p className="footnote">{dailyReview?.method??"盤前與盤後資料須完成自動封存後才能計算命中率。"} 命中率不代表策略報酬率。</p></>:<p className="footnote"><LockKeyhole size={15} style={{verticalAlign:"middle"}}/> 登入後查看 AI 盤後檢討與歷史命中率。</p>}
      </section>
      <section className="hero hero-balanced" id="desktop-news">
        <div className="hero-copy" style={{alignSelf:"stretch",display:"flex",flexDirection:"column",justifyContent:"flex-start",paddingTop:12}}>
          <div className="eyebrow"><span className="live-dot"></span> GLOBAL FINANCIAL NEWS · 多來源重要新聞</div>
          <h2 style={{fontSize:"clamp(24px,2.6vw,38px)",margin:"14px 0 6px"}}>全球即時財經快訊</h2>
          <p style={{margin:"0 0 12px",fontSize:13}}>一般新聞：富途牛牛；重要人士及台灣科技金融：Google 新聞彙整多家媒體 · 點擊閱讀來源</p><div className="news-tab-buttons" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",alignItems:"stretch",gap:10,marginBottom:16,width:"100%"}}><button className="btn btn-secondary" onClick={()=>setNewsTab("all")} style={{opacity:newsTab==="all"?1:.65,minWidth:0,width:"100%",whiteSpace:"normal"}}>全部財經快訊</button><button className="btn btn-secondary" onClick={()=>setNewsTab("important")} style={{opacity:newsTab==="important"?1:.65,minWidth:0,width:"100%",whiteSpace:"normal"}}><span className="news-important-mobile-label">重要人士發言 ({importantNews.length})</span><span className="news-important-desktop-label">重要人士發言／台灣科技金融 ({importantNews.length})</span></button></div>
          {(newsTab==="all"?news:importantNews).length>0 ? <div className="global-news-expanded" aria-label="全球財經新聞" style={{display:"grid",gap:0,maxHeight:420,overflowY:"auto",overscrollBehavior:"contain",paddingRight:8}}>
            {(newsTab==="all"?news:importantNews).slice(0,24).map((item,i)=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid #64748b33",color:"inherit",textDecoration:"none"}}>
              {newsTab==="all" && (item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" style={{width:92,height:68,flexShrink:0,objectFit:"cover",borderRadius:8,background:"#1e293b"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div aria-hidden="true" style={{width:92,height:68,flexShrink:0,borderRadius:8,background:"#182437",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8"}}><Newspaper size={24}/></div>)}
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
        <section className="holdings-panel" id="desktop-sectors" aria-label="AI熱門產業概念股-資金成交熱度">
          <div className="holdings-heading"><span>AI熱門產業概念股-資金成交熱度</span><small>CCL／PCB／先進封裝上下游</small></div>
          <div className="holdings-fund-title">今日 AI 供應鏈成交熱度 <span>{aiFlow?.asOf??"讀取中"} · 上市盤後資料</span></div>
          <p className="holdings-date">{aiFlow?.groups?.length?"成交金額最高："+aiFlow.groups[0].name+"（"+(aiFlow.groups[0].turnover/1e8).toFixed(1)+" 億元）":aiFlowError||"正在讀取證交所成交資料"}。成交金額是資金活躍度，並非買超淨流入。</p>
          {aiFlow?.groups?.slice(0,10).map(g=><div className="holdings-row" key={g.name}>
            <span className="holdings-name">{g.name}<small> {g.chain}</small><small className="sector-companies">代表公司：{g.stocks.map(stock=>stock.name+"（"+stock.symbol+"）").join("、")||"尚無成分股資料"}</small></span>
            <div className="holdings-bar"><i style={{width:(g.turnover/Math.max(aiFlow.groups[0].turnover,1)*100).toFixed(1)+"%"}}/></div>
            <strong>{(g.turnover/1e8).toFixed(1)}億</strong>
          </div>)}
          <p className="footnote">分類採本站 AI 供應鏈觀察清單；不同族群可能共用成分股。僅比較各群成分股成交金額，不可視為資金淨流入排名。</p>
          <p className="footnote">代表公司來自本站產業觀察清單及證交所股票名稱，每組顯示成交金額較高的最多五家公司；並非產業完整名單。</p>
        </section>
        </div>
        <div className="hero-visual" id="desktop-index">
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
          <div style={{border:"1px solid #64748b55",borderRadius:12,padding:14,margin:"0 0 14px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:12}}>
              <strong style={{fontSize:17}}>富台指換算台指參考點數</strong>
              <small style={{color:"#94a3b8"}}>海外市場方向參考 · 非開盤預測</small>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10}}>
              <div><small>富台期 TWN · HiStock</small><strong style={{display:"block",fontSize:23}}>{formatPrice(ftse?.price)}</strong><small style={{color:ftse?.changePercent!=null?(ftse.changePercent>=0?"#fb7969":"#42c4a5"):undefined}}>{ftse?(ftse.changePercent>=0?"+":"")+ftse.changePercent.toFixed(2)+"%":"暫無有效報價"}</small></div>
              <div><small>推估台指參考點位</small><strong style={{display:"block",fontSize:23}}>{ftse&&closing?.value!=null?formatPrice(closing.value*(1+ftse.changePercent/100)):"—"}</strong><small>{ftse&&closing?.value!=null?"以加權指數前收盤 × 富台指漲跌幅":"等待富台指及加權指數收盤資料"}</small></div>
              <div><small>推估台指變動</small><strong style={{display:"block",fontSize:23,color:ftse?.changePercent!=null?(ftse.changePercent>=0?"#fb7969":"#42c4a5"):undefined}}>{ftse&&closing?.value!=null?(ftse.changePercent>=0?"+":"")+formatPrice(closing.value*ftse.changePercent/100)+" 點":"—"}</strong><small>{ftse&&night?.price&&closing?.value!=null?"與台指期夜盤差 "+formatPrice(night.price-closing.value*(1+ftse.changePercent/100))+" 點":"夜盤差距待有效報價"}</small></div>
            </div>
            <p className="footnote" style={{margin:"10px 0 0"}}>{ftse?ftse.source+" · "+(ftse.quoteTime?"報價 "+new Date(ftse.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"來源未提供可驗證報價時間")+" · 非即時報價":ftseError||"正在讀取富台指"}。以同漲跌幅估算，不是精準換算；富台指與加權指數成分、基差不同，休市及報價延遲時請勿當作即時開盤價。</p>
          </div>
          <div className="market-volume-card">
            <div><small>上市市場 · 最近公布交易量</small><strong>{closing?.tradeVolume!=null?(closing.tradeVolume/1000).toLocaleString("zh-TW",{maximumFractionDigits:0})+" 張":"—"}</strong><small>{closing?closing.date+" · 全市場成交股數換算（1 張＝1,000 股）":closingError||"讀取中"}</small></div>
            <div><small>上市市場 · 成交金額</small><strong>{closing?.tradeValue!=null?(closing.tradeValue/100000000).toLocaleString("zh-TW",{maximumFractionDigits:2})+" 億元":"—"}</strong><small>{closing?closing.date+" · TWSE FMTQIK 官方盤後統計":"盤後資料尚未取得"}</small></div>
          </div>
          <p className="footnote">交易量與成交金額採證交所公布的上市市場每日統計；收盤後待官方資料更新才顯示當日總量。未更新前保留最近公布交易日與日期，不以盤中取樣冒充當日總量。</p>
          <div className="taiex-trend-heading" style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
            <strong>台股指數趨勢</strong>
            <div role="group" aria-label="走勢圖時間範圍" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {([["live","即時"],["1d","當日"],["2d","二日"],["3d","三日"]] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setTrendRange(value)} aria-pressed={trendRange===value} className={trendRange===value?"btn btn-primary":"btn btn-secondary"} style={{padding:"6px 11px",fontSize:12}}>{label}</button>)}
            </div>
          </div>
          {trendRange==="live"||trendRange==="1d"?<>
            <div className="sparkline"><div className="spark-grid"/><HourChart points={indexChartPoints} base={taiex?.value!=null&&taiex.change!=null?taiex.value-taiex.change:closing?.date!==taiex?.date?closing?.value??null:null}/></div>
            <p className="footnote">{indexChartPoints.length?"最近更新："+indexChartPoints[indexChartPoints.length-1].time.replace("T"," ")+" · "+formatPrice(indexChartPoints[indexChartPoints.length-1].value)+" 點":"目前尚無有效當日走勢資料"} · {trendRange==="live"?"交易時段自動更新，收盤後保留最後有效資料":"當日有效分鐘走勢"} · 資料可能延遲</p>
          </>:<div style={{padding:"20px 12px",border:"1px solid #64748b55",borderRadius:12}}>
            <strong>{trendRange==="2d"?"最近二日":"最近三日"}走勢</strong>
            <p className="footnote">目前行情來源只提供當日分鐘資料，尚未串接跨交易日歷史分鐘資料；不以單日資料假裝二日或三日走勢。</p>
            <p className="footnote">可先切回「即時」或「當日」查看最後有效行情。</p>
          </div>}
          {showTaiwanNight&&<details style={{marginTop:12}}><summary style={{cursor:"pointer",fontWeight:700}}>台指期夜盤走勢（展開查看）</summary>
            <div className="sparkline"><HourChart points={nightChartPoints} base={nightChartPoints[0]?.value??null} session="night"/></div>
            <p className="footnote">{nightChartPoints.length?"最近更新："+nightChartPoints[nightChartPoints.length-1].time.replace("T"," ")+" · "+formatPrice(nightChartPoints[nightChartPoints.length-1].value)+" 點":"尚無有效夜盤走勢資料"} · 收盤後保留最後有效資料 · {nightHistorySource||nightError||"行情可能延遲"}</p>
          </details>}
          <div className="visual-bottom"><span><i className="dot dot-red"></i> 台股官方資料</span><span><i className="dot dot-blue"></i> 全球行情 API</span></div>

        </div>
      </section>


          <div className="market-analysis-wide" id="desktop-market">          <div className="holdings-divider" />
          <div className="holdings-fund-title">今日台灣股市分析 <span>{dailyAnalysis?.date ?? "載入中"} · 國際市場／日韓股／新台幣</span></div>
          <p className="holdings-note">{dailyAnalysis?.marketView ?? "正在取得國際市場行情與今日台股分析…"}</p>
          <div className="daily-market-grid">{dailyAnalysis?.quotes.map(q=><div key={q.symbol} className="daily-market-quote"><small>{q.label}</small><strong>{q.value==null?"暫無資料":q.value.toLocaleString("zh-TW",{maximumFractionDigits:2})}</strong><span className={q.changePct==null?"":q.changePct>0?"market-up":"market-down"}>{q.changePct==null?"—":(q.changePct>0?"+":"")+q.changePct.toFixed(2)+"%"}</span><MarketMiniTrend values={q.trend5d??[]} label={q.label}/></div>)}</div>
          <p className="holdings-note"><b>日韓股影響：</b>{dailyAnalysis?.asia??"等待資料"}</p>
          <p className="holdings-note"><b>台幣升貶影響：</b>{dailyAnalysis?.currency??"等待資料"}</p>
          <p className="holdings-note"><b>今日觀察重點：</b>{dailyAnalysis?.risk??"等待資料"}</p>
          <p className="holdings-note">資料來源：{dailyAnalysis?.source??"讀取中"}。{dailyAnalysis?.generatedAt?"查詢時間："+new Date(dailyAnalysis.generatedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):""} · 每 5 分鐘查詢；行情可能延遲，分析為規則式研判，非即時交易建議。</p>
          <div className="mobile-us-futures-summary"><strong>美股期貨參考</strong><p>{usFutures?usFutures.name+"："+formatPrice(usFutures.price)+" 點"+(usFutures.change!=null?"（"+(usFutures.change>0?"+":"")+formatPrice(usFutures.change)+"）":""):"目前無可用的美股期貨報價"}</p><small>{usFutures?.quoteTime?"資料時間："+new Date(usFutures.quoteTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"資料時間待確認"} · 期貨行情可能延遲</small></div>
</div>

                <section className="section weekly-calendar" aria-label="本週行事曆">
        <div className="section-heading"><div><div className="eyebrow">WEEKLY ECONOMIC CALENDAR</div><h2>🦞 本週行事曆</h2><p>週一至週五重要財經公布 · 時間均為台灣時間</p></div></div>
        <div className="weekly-calendar-grid">{Array.from({length:5},(_,i)=>{const base=weekCalendar?.monday?new Date(weekCalendar.monday+"T12:00:00Z"):new Date();const date=new Date(base);date.setUTCDate(base.getUTCDate()+i);const day=date.toISOString().slice(0,10);const items=weekCalendar?.events.filter(e=>e.date===day).slice(0,5)??[];return <div key={i} className="weekly-calendar-day"><h3>{day.slice(5).replace("-","/")}　週{["一","二","三","四","五"][i]}</h3>{items.length?items.map((e,k)=><div className="weekly-calendar-event" key={k}><small>{e.region}　{e.time}　<span style={{color:e.level==="high"?"#fb7185":"#fbbf24"}}>●</span></small><strong>{e.title}</strong>{e.detail&&<small>{e.detail}</small>}</div>):<p className="weekly-calendar-empty">{weekCalendar?.status==="unavailable"?"資料來源暫不可用":"尚無已確認的重要公布"}</p>}</div>;})}</div>
        <p className="holdings-note" style={{marginTop:12}}>資料來源：Forex Factory 經濟行事曆。法說會聚焦各 AI 產業三家代表企業，僅顯示已確認的公告；時間均為台灣時間。</p>
      </section>

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
      <section className="section" id="desktop-flows" aria-label="HiStock 外資投信買賣超監測" style={{marginTop:24}}>
        <div className="section-heading"><div><div className="eyebrow">HISTOCK INSTITUTIONAL FLOW</div><h2>外資與投信買賣超｜HiStock 監測</h2><p>每 60 秒檢查 HiStock 已公布的最新交易日統計；非逐筆盤中即時交易數據。</p></div></div>
        <div className="holdings-panel">
          {positioning?.liveInstitutional ? <><p className="holdings-date">交易日：{positioning.liveInstitutional.date} · 單位：億元 · 資料擷取：{new Date(positioning.retrievedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</p>
          <div className="daily-market-grid">{([{label:"外資買賣超",value:positioning.liveInstitutional.foreignYi},{label:"投信買賣超",value:positioning.liveInstitutional.trustYi},{label:"自營商買賣超",value:positioning.liveInstitutional.dealerYi},{label:"三大法人合計",value:positioning.liveInstitutional.totalYi}]).map(item=><div className="daily-market-quote" key={item.label}><small>{item.label}</small><strong className={item.value>=0?"market-up":"market-down"}>{item.value>0?"+":""}{item.value.toFixed(2)} 億</strong></div>)}</div>
          <p className="holdings-note">法人動向：{positioning.liveInstitutional.foreignYi<0?"外資賣超":"外資買超"}、{positioning.liveInstitutional.trustYi<0?"投信賣超":"投信買超"}；{positioning.liveInstitutional.totalYi>=0?"三大法人合計買超":"三大法人合計賣超"}。此為資金面觀察，不單獨構成進出場訊號。</p></> : <p className="holdings-note">HiStock 法人數據尚未成功驗證，暫不顯示估計值。{positioningError}</p>}
          <p className="footnote">來源：HiStock 上市三大法人籌碼圖表 · 更新頻率取決於來源網站實際公布時間。</p>
        </div>
      </section>

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

      <section className="section" aria-label="當日爆量與法人買超排行榜" style={{marginTop:24}}>
        <div className="section-heading"><div><div className="eyebrow">VOLUME & COMPANY NEWS</div><h2>當日成交金額熱門股／公司最新新聞</h2><p>左側依上市個股成交金額排名；右側對應各公司的最新新聞，方便追蹤量能與題材。</p></div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:20}}>
          <div className="holdings-panel volume-leaders-panel"><div className="holdings-fund-title">當日成交金額 Top 10</div><p className="holdings-date">{aiFlow?.asOf??"等待資料"} · 上市個股盤後快照</p>
          {aiFlow?.volumeLeaders?.slice(0,10).map((x,i)=><div className="holdings-row" key={x.symbol}><span className="holdings-name">{i+1}. {x.name} <small>{x.symbol}</small></span><strong>{(x.value/1e8).toFixed(1)} 億</strong></div>)}
          {!aiFlow&&<p>{aiFlowError||"載入中…"}</p>}</div>
          <div className="holdings-panel volume-leaders-panel"><div className="holdings-fund-title">成交金額 Top 10 公司最新新聞</div><p className="holdings-date">依左側成交金額排名對應 · 近七天新聞 · 每十分鐘檢查</p>
          {aiFlow?.volumeLeaders?.slice(0,10).map((stock,i)=>{const article=leaderNews.find(n=>n.symbol===stock.symbol);return <div key={stock.symbol} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:5,padding:"13px 0",borderBottom:"1px solid #64748b33",minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,lineHeight:1.5,overflowWrap:"anywhere"}}>{i+1}. {stock.name} <span style={{fontSize:12,opacity:.7}}>{stock.symbol}</span></div>
            <div style={{minWidth:0,fontSize:13,lineHeight:1.65,overflowWrap:"anywhere",wordBreak:"break-word"}}>{article?<a href={article.url} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"underline",textUnderlineOffset:3,display:"block",whiteSpace:"normal",overflowWrap:"anywhere"}}>{article.title}</a>:<span style={{opacity:.65}}>近七天尚無可取得新聞</span>}</div>
            {article?.publishedAt&&<div style={{fontSize:11,opacity:.65,lineHeight:1.5}}>{new Date(article.publishedAt).toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"})} · {article.source}</div>}
          </div>;})}
          {!aiFlow?.volumeLeaders?.length&&<p className="footnote">{aiFlowError||"成交金額排行載入中…"}</p>}
          {leaderNewsError&&<p className="footnote">新聞來源暫不可用：{leaderNewsError}</p>}
          </div>
        </div>
        <p className="footnote">資料：TWSE 公開資訊；每五分鐘檢查更新。若證交所尚未發布當日盤後資訊，資料可能是上一交易日，請依日期判讀。新聞來源：Google 新聞 RSS，搜尋結果不代表公司官方公告，請點閱原文確認。</p>
      </section>

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



      <nav className="mobile-bottom-nav" aria-label="手機版主要功能">
        {([{id:"news",label:"新聞",icon:NewsIcon},{id:"market",label:"今日台股",icon:TrendingUp},{id:"index",label:"加權指數",icon:BarChart3},{id:"flows",label:"法人籌碼",icon:Users},{id:"sectors",label:"熱門產業",icon:Layers3},{id:"charts",label:"個股分析",icon:CandlestickChart},{id:"account",label:"會員",icon:UserRound}] as const).map(item=>{const Icon=item.icon;return <button type="button" key={item.id} className={mobileTab===item.id?"active":""} aria-current={mobileTab===item.id?"page":undefined} onClick={()=>selectMobileTab(item.id)}><Icon size={22} strokeWidth={mobileTab===item.id?2.6:1.9}/><span>{item.label}</span></button>;})}
      </nav>

      <footer><a className="brand footer-brand" href="#"><span className="brand-mark brand-mark-custom"><img src={lobsterLogo.src} alt="AI股市龍蝦 Logo" onError={e=>{e.currentTarget.style.display="none";}} /></span><span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE</small></span></a><p>本網站為開發測試版。盤中行情與歷史技術分析均為測試功能；上櫃、新聞、部分法人資料及 AI 分析尚未完整串接，內容不構成投資建議。</p><span>© {new Date().getFullYear()} AI股市龍蝦</span></footer>
    </main>
  );
}
