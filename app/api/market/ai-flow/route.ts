import {cachedResponse} from "../../../../lib/response-cache";
import {sectors} from "../../../../lib/sector-universe";
import {summarizeSectors} from "../../../../lib/sector-history";
import {sectorHistory} from "../../../../lib/sector-history-provider";
import {taiwanCalendar} from "../../../../lib/trading-calendar";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Row=Record<string,string>;

function num(v:unknown){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:0;}
function twDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
type Quote={symbol:string;name:string;volume:number;value:number;close:number;change:string;transactions:number};
function cleanHtml(s:string){return s.replace(/<[^>]+>/g,"").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").trim();}
async function histockQuotes():Promise<Quote[]>{
 const res=await fetch("https://histock.tw/stock/rank.aspx?m=13&p=all",{headers:{"User-Agent":"Mozilla/5.0 (compatible; AIStockLobster/1.0)","Accept":"text/html"},next:{revalidate:15},signal:AbortSignal.timeout(5500)});
 if(!res.ok)throw Error("HiStock HTTP "+res.status);
 const html=await res.text();
 const result:Quote[]=[];
 for(const match of Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))){
  const cells=Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map(m=>cleanHtml(m[1]));
  const code=cells.findIndex(c=>/^\d{4}$/.test(c));
  if(code<0||cells.length-code<13)continue;
  const symbol=cells[code],name=cells[code+1],close=num(cells[code+2]),volume=num(cells[code+11]),value=num(cells[code+12])*100000000;
  if(name&&close>0&&value>0&&volume>0)result.push({symbol,name,close,volume:volume*1000,value,change:cells[code+3]??"",transactions:0});
 }
 if(result.length<20)throw Error("HiStock 排行資料解析不足");
 return result;
}
async function twseQuotes():Promise<Quote[]>{
 const res=await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",{next:{revalidate:15},signal:AbortSignal.timeout(6500)});
 if(!res.ok)throw Error("TWSE HTTP "+res.status);
 const raw=await res.json() as Row[];
 if(!Array.isArray(raw)||raw.length<100)throw Error("TWSE 個股資料不足");
 return raw.flatMap(r=>{const symbol=String(r.Code??"").trim();if(!/^\d{4}$/.test(symbol))return [];return [{symbol,name:r.Name??symbol,volume:num(r.TradeVolume),value:num(r.TradeValue),close:num(r.ClosingPrice),change:r.Change??"",transactions:num(r.Transaction)}];});
}
async function yahooQuotes():Promise<{rows:Quote[];date:string}>{
 const response=await fetch("https://tw.finance.yahoo.com/rank/turnover",{headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"},next:{revalidate:15},signal:AbortSignal.timeout(5500)});
 if(!response.ok)throw Error("Yahoo HTTP "+response.status);
 const html=await response.text();
 const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ");
 const dateMatch=plain.match(/資料時間\s*[:：]\s*(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
 if(!dateMatch)throw Error("Yahoo 無法確認交易日期");
 const date=dateMatch[1]+"-"+dateMatch[2].padStart(2,"0")+"-"+dateMatch[3].padStart(2,"0");
 if(date>twDate())throw Error("Yahoo 日期異常");
 const rows:Quote[]=[];
 const pattern=/(\d{4})\.(?:TW|TWO)\s+([\d,]+(?:\.\d+)?)\s+[+-]?[\d,]+(?:\.\d+)?\s+[+-]?[\d.]+%\s+[\d,]+(?:\.\d+)?\s+[\d,]+(?:\.\d+)?\s+[\d,]+(?:\.\d+)?\s+([\d,]+)\s+([\d,]+(?:\.\d+)?)/g;
 for(const match of Array.from(plain.matchAll(pattern))){
  const symbol=match[1],close=num(match[2]),volume=num(match[3])*1000,value=num(match[4])*100000000;
  const before=plain.slice(Math.max(0,(match.index??0)-100),match.index??0).trim().split(/\s+/);
  const name=before.at(-1)??symbol;
  if(close>0&&volume>0&&value>0&&name)rows.push({symbol,name,close,volume,value,change:"",transactions:0});
 }
 if(rows.length<10)throw Error("Yahoo 成交金額排行解析不足");
 return {rows,date};
}
function comparableQuotes(a:Quote[],b:Quote[]){
 const map=new Map(b.map(x=>[x.symbol,x.value]));
 const compared=a.slice(0,30).flatMap(x=>{const v=map.get(x.symbol);return v&&v>0?[Math.abs(x.value/v-1)]:[];});
 return compared.length>=5&&compared.filter(delta=>delta<=0.02).length>=5&&compared.filter(delta=>delta<=0.02).length/compared.length>=0.8;
}
async function marketQuotes():Promise<{rows:Quote[];source:string;quoteDate:string|null;coverage:string}>{
 // Parallel probes cap worst-case latency: a failed primary must not consume the whole function timeout.
 const [h,y,t]=await Promise.allSettled([histockQuotes(),yahooQuotes(),twseQuotes()]);
 const histock=h.status==="fulfilled"?h.value:null;
 const yahoo=y.status==="fulfilled"?y.value:null;
 const official=t.status==="fulfilled"?t.value:null;
 let primary:Quote[]|null=null,source="",quoteDate:string|null=null;
 if(histock){primary=histock;source="HiStock";}
 const taipeiClock=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const hour=Number(taipeiClock.find(p=>p.type==="hour")?.value??12);
 const weekday=taipeiClock.find(p=>p.type==="weekday")?.value??"";
 const previousSessionAllowed=hour<9||weekday==="Sat"||weekday==="Sun";
 const yahooAgeDays=(Date.parse(twDate()+"T00:00:00Z")-Date.parse((yahoo?.date??"1970-01-01")+"T00:00:00Z"))/86400000;
 // A dated Yahoo ranking is safer than an undated HiStock snapshot when the
 // providers disagree. Before market open or on weekends, accept the last
 // verified trading session (up to four days old), never silently label it today.
 const yahooUsable=Boolean(yahoo&&yahooAgeDays>=0&&yahooAgeDays<=4&&(yahoo.date===twDate()||previousSessionAllowed));
 if(yahooUsable&&yahoo&&(!primary||!comparableQuotes(primary,yahoo.rows))){
  primary=yahoo.rows;source="Yahoo 股市（已標示交易日期）";quoteDate=yahoo.date;
 }
 // HiStock's ranking HTML has no reliable trade-date field. Only attach Yahoo's
 // independently published date when at least five turnover figures agree within 2%.
 // This also works just after midnight, when the latest trading day is yesterday.
 if(histock&&primary===histock&&yahoo&&comparableQuotes(histock,yahoo.rows)){
  quoteDate=yahoo.date;
  source="HiStock（Yahoo 成交金額與日期交叉驗證）";
 }
 if(!primary&&official)return {rows:official,source:"TWSE（前兩來源無效）",quoteDate:null,coverage:"listed_full"};
 if(!primary)throw Error("HiStock、Yahoo 與 TWSE 行情來源均無有效資料");
 // Never mix unmatched dates from independent feeds.
 if(official&&comparableQuotes(primary,official)){
  const merged=new Map(official.map(x=>[x.symbol,x]));
  for(const row of primary)merged.set(row.symbol,row);
  return {rows:Array.from(merged.values()),source:source+" + TWSE 一致性驗證補齊",quoteDate,coverage:"listed_full_plus_ranking"};
 }
 return {rows:primary,source,quoteDate,coverage:"ranking_partial"};
}
async function buildResponse(){
 try{
  const [{rows,source,quoteDate,coverage},instRes,history,calendar]=await Promise.all([
   marketQuotes().catch(()=>({rows:[] as Quote[],source:"最新排行來源暫不可用",quoteDate:null,coverage:"unavailable"})),
   fetch("https://www.twse.com.tw/rwd/zh/fund/T86?date="+twDate().replace(/-/g,"")+"&selectType=ALL&response=json",{next:{revalidate:15},signal:AbortSignal.timeout(6000)}).catch(()=>new Response(null,{status:503})),
   sectorHistory(twDate()),
    taiwanCalendar().catch(()=>({referenceDate:null,latestCompletedDate:null}))
  ]);
  const bySymbol=new Map(rows.map(r=>[r.symbol,r]));
  const asOf=quoteDate;
  const expectedDate=calendar.referenceDate;
  const asOfVerified=Boolean(asOf&&expectedDate&&asOf>=expectedDate&&asOf<=twDate());
  const groups=summarizeSectors(history,sectors,twDate());
  const sectorAsOf=groups[0]?.historyDate??null;
  const sectorExpectedDate=calendar.latestCompletedDate??calendar.referenceDate;
  const sectorHistoryStale=Boolean(sectorAsOf&&sectorExpectedDate&&sectorAsOf<sectorExpectedDate);
  const radar={hottest:groups.filter(g=>g.coverageRatio===1).sort((a,b)=>b.turnover-a.turnover).slice(0,3),emerging:[...groups].filter(g=>g.radarStatus==="emerging").sort((a,b)=>(b.weeklyDelta??0)-(a.weeklyDelta??0)).slice(0,3),cooling:[...groups].filter(g=>g.radarStatus==="cooling").sort((a,b)=>(a.weeklyDelta??0)-(b.weeklyDelta??0)).slice(0,3)};
  const volumeLeaders=rows.filter(r=>r.volume>0&&r.close>0).sort((a,b)=>b.value-a.value).slice(0,15);
  let instDate:string|null=null;const buyers:{symbol:string;name:string;shares:number;volume:number;value:number}[]=[];
  if(instRes.ok){
   const data=await instRes.json().catch(()=>null) as {stat?:string;date?:string;fields?:string[];data?:string[][]}|null;
   if(data?.stat==="OK"&&Array.isArray(data.fields)&&Array.isArray(data.data)){
    const code=data.fields.indexOf("證券代號"),name=data.fields.indexOf("證券名稱"),total=data.fields.indexOf("三大法人買賣超股數");
    const datedInstitutional=String(data.date??"").replace(/^(\d{4})(\d{2})(\d{2})$/,"$1-$2-$3");
     if(code>=0&&total>=0&&datedInstitutional===asOf){instDate=datedInstitutional;for(const r of data.data){const symbol=String(r[code]??"").trim(),shares=num(r[total]);if(!/^\d{4}$/.test(symbol)||shares<=0)continue;const quote=bySymbol.get(symbol);buyers.push({symbol,name:r[name]??quote?.name??symbol,shares,volume:quote?.volume??0,value:quote?.value??0});}}
   }
  }
  buyers.sort((a,b)=>b.shares-a.shares);
  return NextResponse.json({status:"ok",asOf,asOfVerified,coverage,sectorAsOf,sectorExpectedDate,sectorHistoryStale,sectorHistorySource:"TWSE / TPEx 官方每日收盤行情",historyStatus:groups.some(g=>g.historicalQuality==="verified")?"available":"insufficient",historicalSessions:history.length,groups,radar,topSector:groups[0]??null,volumeLeaders,buyers:buyers.slice(0,15),institutionalDate:instDate,source:source+" / TWSE T86 / TWSE + TPEx 歷史",note:"族群按本站公開成分股清單計算成交金額，不等於淨資金流入；大戶以三大法人當日買超作代理，不等於主力或單一大戶。排行來源若僅涵蓋部分股票，產業排名可能不完整；無法驗證行情日期時不標示為今日資料；並非逐筆即時。"},
   {headers:{"Cache-Control":"public, s-maxage=300"}});
 }catch(e){return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"暫無可驗證行情"},{status:503});}
}

export async function GET(){return cachedResponse("app/api/market/ai-flow/route.ts",300000,buildResponse);}
