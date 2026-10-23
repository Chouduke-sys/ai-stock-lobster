import {getServerSession} from "next-auth";
import {authOptions} from "../../../../lib/auth";
import {NextResponse} from "next/server";
import {getPolicySignals} from "../../../../lib/policy-news-analysis";
import {backtestedAllocation} from "../../../../lib/backtested-allocation";
import {extractHtmlTables,findTableByHeaders,parseMarketNumber} from "../../../../lib/market-table-extractor";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Q={label:string;symbol:string;value:number|null;changePct:number|null;time:string|null};
const symbols:[string,string][]=[["台指期近月","TX=F"],["標普500期貨","ES=F"],["那斯達克100期貨","NQ=F"],["費城半導體","^SOX"],["那斯達克指數","^IXIC"],["美元／新台幣","TWD=X"],["美元指數","DX-Y.NYB"],["VIX","^VIX"],["美國10年公債殖利率","^TNX"]];
async function quote([label,symbol]:[string,string]):Promise<Q>{
 const empty={label,symbol,value:null,changePct:null,time:null};
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const res=await fetch("https://"+host+"/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=5d",{next:{revalidate:300},signal:AbortSignal.timeout(4000),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!res.ok)continue;
   const result=(await res.json() as {chart?:{result?:{meta?:{regularMarketPrice?:number;previousClose?:number;chartPreviousClose?:number;regularMarketTime?:number}}[]}}).chart?.result?.[0]?.meta;
   const value=result?.regularMarketPrice,prev=result?.previousClose??result?.chartPreviousClose;
   if(typeof value!=="number"||!Number.isFinite(value))continue;
   return {label,symbol,value,changePct:typeof prev==="number"&&prev!==0?(value/prev-1)*100:null,time:typeof result?.regularMarketTime==="number"?new Date(result.regularMarketTime*1000).toISOString():null};
  }catch{}
 }
 return empty;
}
function taipeiParts(){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const v=(t:string)=>p.find(x=>x.type===t)?.value??"00";
 return {date:v("year")+"-"+v("month")+"-"+v("day"),minute:Number(v("hour"))*60+Number(v("minute"))};
}
type MarginData={date:string;financingBalance:number|null;financingChange:number|null;shortBalance:number|null;shortChange:number|null;source:string};
function numeric(raw:unknown):number|null{const n=Number(String(raw??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)&&String(raw??"").trim()!==""?n:null;}
async function yahooMargin():Promise<MarginData|null>{
 try{
  const res=await fetch("https://tw.stock.yahoo.com/margin-balance",{next:{revalidate:600},signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!res.ok)return null;
  const html=await res.text();
  const plain=html.replace(new RegExp("<[^>]+>","g")," ").replace(new RegExp("&nbsp;|&#160;","g")," ").replace(/\s+/g," ");
  const pattern=new RegExp("(20[0-9]{2})/([0-9]{1,2})/([0-9]{1,2})\\\\s+([+-]?[0-9,]+(?:\\\\.[0-9]+)?)\\\\s+([0-9,]+(?:\\\\.[0-9]+)?)\\\\s+([+-]?[0-9,]+)\\\\s+([0-9,]+)\\\\s+([0-9.]+)%","g");
  const matches:Array<RegExpExecArray>=[];let match:RegExpExecArray|null;while((match=pattern.exec(plain))!==null){matches.push(match);if(match[0].length===0)pattern.lastIndex++;}
  if(!matches.length)return null;
  const m=matches.sort((a,b)=>b[1].localeCompare(a[1])||Number(b[2])-Number(a[2])||Number(b[3])-Number(a[3]))[0];
  const number=(v:string)=>Number(v.replace(/,/g,""));
  const date=m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
  const financingBalance=number(m[5]),financingChange=number(m[4]),shortBalance=number(m[7]),shortChange=number(m[6]);
  if(![financingBalance,financingChange,shortBalance,shortChange].every(Number.isFinite))return null;
  return {date,financingBalance,financingChange,shortBalance,shortChange,source:"Yahoo 股市（上市；融資億元／融券張）"};
 }catch{return null;}
}

type HiStockMargin=MarginData & {borrowBalance:number|null;borrowChange:number|null};
async function histockMargin():Promise<HiStockMargin|null>{
 try{
  const res=await fetch("https://histock.tw/stock/three.aspx?m=mg",{next:{revalidate:600},signal:AbortSignal.timeout(8000),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!res.ok)return null;
  const html=await res.text();
  const tables=extractHtmlTables(html);
  const table=findTableByHeaders(tables,[/日期/,/融資餘額/,/融資增加/,/融券餘額/,/融券增加/]);
  if(!table)return null;
  const idx=(pattern:RegExp)=>table.headers.findIndex(h=>pattern.test(h));
  const dateIndex=idx(/日期/),financeIndex=idx(/融資餘額/),financeChangeIndex=idx(/融資增加/),shortIndex=idx(/融券餘額/),shortChangeIndex=idx(/融券增加/);
  const pageYear=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei",year:"numeric"}).slice(0,4);
  const year=Number(pageYear);
  const taipeiMonth=Number(new Date().toLocaleDateString("en-US",{timeZone:"Asia/Taipei",month:"numeric"}));
  const parsed=table.rows.flatMap(row=>{
   const dateValue=row[dateIndex]??"";
   const m=dateValue.match(/^(?:(20\d{2})[\/-])?(\d{1,2})[\/-](\d{1,2})$/);
   if(!m)return [];
   const month=Number(m[2]),day=Number(m[3]);
   if(month<1||month>12||day<1||day>31)return [];
   const resolvedYear=m[1]?Number(m[1]):month>taipeiMonth+1?year-1:year;
   const date=resolvedYear+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
   const financingBalance=parseMarketNumber(row[financeIndex]??"");
   const financingChange=parseMarketNumber(row[financeChangeIndex]??"");
   const shortBalance=parseMarketNumber(row[shortIndex]??"");
   const shortChange=parseMarketNumber(row[shortChangeIndex]??"");
   if(financingBalance===null||financingChange===null||shortBalance===null||shortChange===null)return [];
   if(financingBalance<0||shortBalance<0)return [];
   return [{date,financingBalance,financingChange,shortBalance,shortChange}];
  }).sort((x,y)=>y.date.localeCompare(x.date));
  const latest=parsed[0];
  if(!latest)return null;
  return {...latest,borrowBalance:null,borrowChange:null,source:"HiStock 上市融資融券近三十日行情（融資億元；融券張）"};
 }catch{return null;}
}
async function latestMargin():Promise<MarginData|null>{
 const histock=await histockMargin();if(histock)return histock;
 const yahoo=await yahooMargin();if(yahoo)return yahoo;
 const today=new Date();
 const taipei=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(today);
 const anchor=new Date(taipei+"T00:00:00+08:00");
 for(let offset=0;offset<9;offset++){
  const d=new Date(anchor.getTime()-offset*86400000);
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  const compactDate=date.replace(/-/g,"");
  try{
   const url="https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date="+compactDate+"&selectType=MS&response=json";
   const res=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(4500)});
   if(!res.ok)continue;
   const payload=await res.json() as {stat?:string;tables?:Array<{fields?:string[];data?:string[][];title?:string}>;fields?:string[];data?:string[][]};
   const tables=payload.tables?.length?payload.tables:[{fields:payload.fields,data:payload.data,title:""}];
   for(const table of tables){
    const fields=table.fields??[],rows=table.data??[];
    if(!rows.length)continue;
    const normalized=fields.map(x=>x.replace(/<[^>]*>/g,"").replace(/\\s/g,""));
    const financingBalanceIndex=normalized.findIndex(x=>/融資/.test(x)&&/餘額/.test(x));
    const shortBalanceIndex=normalized.findIndex(x=>/融券/.test(x)&&/餘額/.test(x));
    const financingChangeIndex=normalized.findIndex(x=>/融資/.test(x)&&/增減|差額/.test(x));
    const shortChangeIndex=normalized.findIndex(x=>/融券/.test(x)&&/增減|差額/.test(x));
    const row=rows.find(x=>/合計|總計/.test(String(x[0]??"")))??(rows.length===1?rows[0]:null);
    if(!row||financingBalanceIndex<0||shortBalanceIndex<0)continue;
    const financingBalance=numeric(row[financingBalanceIndex]);
    const shortBalance=numeric(row[shortBalanceIndex]);
    if(financingBalance===null||shortBalance===null)continue;
    return {date,financingBalance,financingChange:financingChangeIndex>=0?numeric(row[financingChangeIndex]):null,shortBalance,shortChange:shortChangeIndex>=0?numeric(row[shortChangeIndex]):null,source:"臺灣證券交易所 MI_MARGN"};
   }
  }catch{}
 }
 return null;
}

type FuturesOptions={date:string;foreignTxNet:number|null;putCallVolume:number|null;putCallOpenInterest:number|null;source:string};
function numValue(x:unknown):number|null{
 if(typeof x==="number")return Number.isFinite(x)?x:null;
 if(typeof x!=="string"||!x.trim()||x.trim()==="-")return null;
 const n=Number(x.replace(/,/g,"").replace(/%/g,"").trim());
 return Number.isFinite(n)?n:null;
}
function normalizedDate(x:unknown):string|null{
 const raw=String(x??"").trim();
 const m=raw.match(/(20\d{2}|1\d{2})[\\/-](\d{1,2})[\\/-](\d{1,2})/);
 if(m){const year=Number(m[1])<1911?Number(m[1])+1911:Number(m[1]);return year+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");}
 const compact=raw.match(/^(20\d{2}|1\d{2})(\d{2})(\d{2})$/);
 if(compact){const year=Number(compact[1])<1911?Number(compact[1])+1911:Number(compact[1]);return year+"-"+compact[2]+"-"+compact[3];}
 return null;
}
async function taifexRows(path:string):Promise<Record<string,unknown>[]>{
 try{
  const res=await fetch("https://openapi.taifex.com.tw/v1/"+path,{next:{revalidate:900},signal:AbortSignal.timeout(7000),headers:{"Accept":"application/json"}});
  if(!res.ok)return [];
  const data=await res.json() as unknown;
  return Array.isArray(data)?data.filter((row):row is Record<string,unknown>=>typeof row==="object"&&row!==null&&!Array.isArray(row)):[];
 }catch{return [];}
}
function field(row:Record<string,unknown>,terms:string[]):unknown{
 const key=Object.keys(row).find(k=>terms.every(t=>k.toLowerCase().includes(t.toLowerCase())));
 return key===undefined?undefined:row[key];
}
async function latestFuturesOptions():Promise<FuturesOptions|null>{
 const [ratios,institutions]=await Promise.all([
  taifexRows("PutCallRatio"),
  taifexRows("MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate")
 ]);
 const dateOf=(r:Record<string,unknown>)=>normalizedDate(field(r,["日期"])??field(r,["Date"]));
 const valid=(r:Record<string,unknown>)=>Boolean(dateOf(r));
 const latestRatio=ratios.filter(valid).sort((a,b)=>(dateOf(b)??"").localeCompare(dateOf(a)??""))[0];
 const ratioDate=latestRatio?dateOf(latestRatio):null;
 const getRatio=(r:Record<string,unknown>,type:"volume"|"oi")=>{
  const entries=Object.entries(r);
  const isRatio=(k:string)=>/比率|ratio/i.test(k);
  const isOpen=(k:string)=>/未平倉|open/i.test(k);
  const pair=entries.find(([k])=>isRatio(k)&&(type==="oi"?isOpen(k):!isOpen(k)));
  return pair?numValue(pair[1]):null;
 };
 const volume=latestRatio?getRatio(latestRatio,"volume"):null;
 const oi=latestRatio?getRatio(latestRatio,"oi"):null;
 const foreignRows=institutions.filter(row=>{
  const values=Object.values(row).map(x=>String(x??""));
  return values.some(v=>/外資|Foreign/i.test(v))&&values.some(v=>/臺股期貨|台股期貨|臺指期貨|台指期貨|TX/i.test(v));
 }).sort((a,b)=>(dateOf(b)??"").localeCompare(dateOf(a)??""));
 const foreign=foreignRows.find(row=>field(row,["未平倉","淨額"])!==undefined||field(row,["Open","Net"])!==undefined);
 const foreignDate=foreign?dateOf(foreign):null;
 const net=foreign?numValue(field(foreign,["未平倉","淨額"])??field(foreign,["Open","Net"])):null;
 if(!ratioDate&&(!foreignDate||net===null))return null;
 const chosen=ratioDate&&foreignDate?(ratioDate>=foreignDate?ratioDate:foreignDate):(ratioDate??foreignDate)!;
 return {date:chosen,foreignTxNet:net,putCallVolume:volume,putCallOpenInterest:oi,source:"臺灣期貨交易所 OpenAPI"};
}
async function wantgooPutCall():Promise<{date:string;volume:number;oi:number;source:string}|null>{
 try{
  const res=await fetch("https://www.wantgoo.com/option/put-call-ratio",{next:{revalidate:900},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!res.ok)return null;
  const html=await res.text();
  const plain=html.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\s+/g," ");
  const re=/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)/g;
  let m:RegExpExecArray|null;let latest:{date:string;volume:number;oi:number;source:string}|null=null;
  while((m=re.exec(plain))!==null){
   const date=m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0"),volume=Number(m[6]),oi=Number(m[9]);
   if(Number.isFinite(volume)&&Number.isFinite(oi)&&volume>=0&&volume<=500&&oi>=0&&oi<=500&&(!latest||date>latest.date))latest={date,volume,oi,source:"玩股網（臺指選擇權 P/C 比）"};
  }
  return latest;
 }catch{return null;}
}
function futuresVerdict(foreign:number|null,volume:number|null,oi:number|null):{sentiment:"bullish"|"bearish"|"neutral";verdict:string;reason:string}{
 const signals:number[]=[];
 if(foreign!==null)signals.push(foreign<=-10000?-2:foreign<0?-1:foreign>=10000?2:foreign>0?1:0);
 if(oi!==null)signals.push(oi>=100?1:oi<75?-1:0);
 if(volume!==null)signals.push(volume>=110?1:volume<85?-1:0);
 const score=signals.reduce((a,b)=>a+b,0);
 if(!signals.length)return {sentiment:"neutral",verdict:"資料不足，暫不判斷",reason:"缺少可驗證的期貨或選擇權籌碼"};
 if(score<=-2)return {sentiment:"bearish",verdict:"期權籌碼偏空，建議降低追價與槓桿",reason:"外資期貨空方或 P/C 比偏弱"};
 if(score>=2)return {sentiment:"bullish",verdict:"期權籌碼偏多，仍需確認開盤量價",reason:"期貨與選擇權訊號偏正向"};
 return {sentiment:"neutral",verdict:"期權訊號分歧，建議中性觀望",reason:"期貨與選擇權訊號尚未形成一致方向"};
}
function priorTaiwanTradingDay(now:Date):string{
 const local=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 let date=new Date(local+"T12:00:00+08:00");
 for(let i=0;i<7;i++){
  date=new Date(date.getTime()-86400000);
  const weekday=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",weekday:"short"}).format(date);
  if(weekday!=="Sat"&&weekday!=="Sun")return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
 }
 return local;
}
export async function GET(request:Request){
 const cronAuthorized=Boolean(process.env.CRON_SECRET)&&request.headers.get("authorization")==="Bearer "+process.env.CRON_SECRET;
 const session=await getServerSession(authOptions);
 if(!session?.user&&!cronAuthorized)return NextResponse.json({status:"unauthorized",error:"請先使用 Google 或 Apple 帳號登入，才能查看每日 08:30 台股盤前分析。"},{status:401,headers:{"Cache-Control":"private, no-store"}});
 const now=taipeiParts(),reportDate=now.date,referenceDate=priorTaiwanTradingDay(new Date());
 const [quotes,twse,news,margin,futuresOptions,wantgooRatio,policySignals,allocationModel]=await Promise.all([
  Promise.all(symbols.map(quote)),
  fetch("https://www.twse.com.tw/rwd/zh/fund/BFI82U?date="+referenceDate.replace(/-/g,"")+"&response=json",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("https://news.google.com/rss/search?q="+encodeURIComponent("台股 外資 投信 融資 台幣 聯準會 川普 when:2d")+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.text():"").catch(()=>""),
  latestMargin(),
  latestFuturesOptions(),
  wantgooPutCall(),
  getPolicySignals(),
  backtestedAllocation()
 ]);
 const validatedMargin=margin?.date===referenceDate?margin:null;
 const marginBorrow=validatedMargin&&"borrowBalance" in validatedMargin?validatedMargin as HiStockMargin:null;
 const validatedFutures=futuresOptions?.date===referenceDate?futuresOptions:null;
 const validatedWantgoo=wantgooRatio?.date===referenceDate?wantgooRatio:null;
 const by=(symbol:string)=>quotes.find(q=>q.symbol===symbol);
 const us=by("ES=F"),tech=by("NQ=F"),semi=by("^SOX"),fx=by("TWD=X"),vix=by("^VIX");
 const pct=(q:Q|undefined)=>q?.changePct==null?"資料待確認":(q.changePct>=0?"+":"")+q.changePct.toFixed(2)+"%";
 const signals=[us,tech,semi].filter(q=>q?.changePct!=null) as Q[];
 const positive=signals.filter(q=>(q.changePct??0)>0).length,negative=signals.filter(q=>(q.changePct??0)<0).length;
 const stance=!signals.length?"資料不足，暫不判斷方向":positive>negative?"國際科技與期貨風險偏好偏正向":negative>positive?"國際科技與期貨走弱，短線宜保守":"多空訊號分歧，偏向區間震盪";
 const flow=twse&&typeof twse==="object"?twse as {date?:string;data?:string[][];fields?:string[]}:null;
 const flowDate=normalizedDate(flow?.date);
 const flowRows=Array.isArray(flow?.data)?flow!.data!.slice(0,8).map(row=>row.join("／")).filter(Boolean):[];
 const parseMoney=(value:string)=>{const n=Number(value.replace(/,/g,"").replace(/\\s/g,""));return Number.isFinite(n)?n:null;};
 const investorRows=(flow?.data??[]).flatMap(row=>{const label=String(row[0]??"");if(!/外資|投信|自營商/.test(label))return [];const value=parseMoney(String(row[row.length-1]??""));return value===null?[]:[{label,value}];});
 const foreign=flowDate===referenceDate?investorRows.find(row=>/外資/.test(row.label)):undefined,trust=flowDate===referenceDate?investorRows.find(row=>/投信/.test(row.label)):undefined;
 const investorScore=foreign&&trust&&flowDate===referenceDate?(foreign.value+trust.value>0?1:foreign.value+trust.value<0?-1:0):null;
 const moneyLabel=(row:{label:string;value:number}|undefined)=>row?row.label+" "+(row.value>=0?"+":"")+(row.value/1e8).toFixed(2)+"億元":"未取得";
 const title=news.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&")??null;
 const mood=(score:number|null)=>score===null?"neutral":score>0?"bullish":score<0?"bearish":"neutral";
 const scoreOf=(q:Q|undefined,invert=false)=>q?.changePct==null?null:Math.abs(q.changePct)<0.05?0:(q.changePct>0?1:-1)*(invert?-1:1);
 const abroadScore=signals.length?positive>negative?1:negative>positive?-1:0:null;
 const fxScore=scoreOf(fx,true);
 const vixScore=vix?.value==null?null:vix.value>=30?-1:vix.value>=25?-1:vix.value<15?1:0;
 const compact=(items:string[])=>items.join("；")+"。";
 const riskInputs=[abroadScore,investorScore,fxScore,vixScore].filter((n):n is number=>n!==null);
 const riskScore=riskInputs.reduce((sum,n)=>sum+n,0);
 const allocation=riskInputs.length<2
  ?{low:30,high:50,reason:"有效風險訊號不足，採中性偏保守倉位"}
  :riskScore>=3?{low:70,high:80,reason:"外圍、資金及波動訊號整體偏正向"}
  :riskScore>=1?{low:50,high:70,reason:"市場略偏多，但仍需開盤量價確認"}
  :riskScore<=-3?{low:20,high:30,reason:"多項風險訊號偏空，優先保留現金"}
  :riskScore<=-1?{low:30,high:50,reason:"市場風險偏高，避免過度曝險"}
  :{low:40,high:60,reason:"多空訊號混合，維持中性配置"};
 const allocationAdvice="今日建議股票總倉位 "+allocation.low+"%～"+allocation.high+"%，保留現金 "+(100-allocation.high)+"%～"+(100-allocation.low)+"%；"+allocation.reason+"。倉位以帳戶淨資產計算，含融資部位的股票市值也須計入；盤前屬情境建議，開盤後依量價及風險調整，不是保證報酬。";
 const optionRatio=validatedWantgoo;
 const optionVolume=optionRatio?.volume??validatedFutures?.putCallVolume??null;
 const optionOi=optionRatio?.oi??validatedFutures?.putCallOpenInterest??null;
 const futuresSignal=futuresVerdict(validatedFutures?.foreignTxNet??null,optionVolume,optionOi);
 const optionDate=optionRatio?.date??validatedFutures?.date??null;
 const marginInterpretation=validatedMargin?.financingChange==null?"融資增減不足，無法判斷散戶槓桿變化。":validatedMargin.financingChange>0?"融資增加代表槓桿資金升高；若指數同步走強可能是追價，也可能提高回檔時的賣壓，須搭配量價與法人買賣超判斷。":validatedMargin.financingChange<0?"融資減少代表槓桿部位收縮；若股價止跌可能有籌碼沉澱效果，但若價格同步下跌，也可能反映停損或斷頭壓力。":"融資餘額變化不大，暫無明確槓桿方向。";
 const futuresInterpretation=validatedFutures?.foreignTxNet==null?"期貨淨部位尚未驗證，不能推論外資避險強度。":validatedFutures.foreignTxNet<0?"外資台指期淨空單，短線須留意避險壓力；仍需比較前日口數變化，不能只憑單日淨空判定看跌。":validatedFutures.foreignTxNet>0?"外資台指期淨多單，方向偏正向；仍需與現貨法人買賣超及前日未平倉變化交叉核對。":"外資台指期淨部位接近零，單靠期貨方向不足以判斷多空。";
 const institutionInterpretation=investorScore===null?"三大法人買賣超資料未核實，暫不判斷籌碼方向。":investorScore>0?"外資與投信合計買超，現貨資金偏正向；仍需觀察是否連續買超。":investorScore<0?"外資與投信合計賣超，現貨資金偏保守；留意賣壓是否延續。":"外資與投信買賣相抵，法人資金方向尚不明確。";
 const sections=[
  {title:"美股與期貨",body:compact(["標普期 "+pct(us),"那指期 "+pct(tech),"費半 "+pct(semi)]),sentiment:mood(abroadScore),verdict:abroadScore===null?"待確認":abroadScore>0?"外圍偏多":abroadScore<0?"外圍偏空":"多空分歧"},
  {title:"外資與投信",body:foreign||trust?"最近公布 "+(flowDate??"日期未提供")+"："+moneyLabel(foreign)+"；"+moneyLabel(trust)+"（新台幣，非當日盤前數據）。"+institutionInterpretation:"法人買賣超暫無可靠數字。",sentiment:mood(investorScore),verdict:investorScore===null?"籌碼待確認":investorScore>0?"法人合計偏買":investorScore<0?"法人合計偏賣":"法人買賣相抵"},
  {title:"融資融券",body:validatedMargin?("結論："+(validatedMargin.financingChange!=null&&validatedMargin.shortChange!=null?(validatedMargin.financingChange<0&&validatedMargin.shortChange>0?"短線偏空：融資減少、融券增加，槓桿買盤退場且空方部位增加。":validatedMargin.financingChange>0&&validatedMargin.shortChange<0?"短線偏多：融資增加、融券減少，買方槓桿回升且空方回補。":"多空訊號分歧，需配合指數量價判斷。"):"籌碼方向尚未明朗。")+" 融資"+(validatedMargin.financingChange==null?"變化未確認":(validatedMargin.financingChange>=0?"+":"")+validatedMargin.financingChange.toLocaleString("en-US")+" 億")+"；融券"+(validatedMargin.shortChange==null?"變化未確認":(validatedMargin.shortChange>=0?"+":"")+validatedMargin.shortChange.toLocaleString("en-US")+" 張")+"。"+(marginBorrow?.borrowChange!=null?"借券賣出"+(marginBorrow.borrowChange>=0?"+":"")+marginBorrow.borrowChange.toLocaleString("en-US")+" 張。":"")+"融資下降不一定是利空，也可能是籌碼沉澱；須搭配股價與法人動向確認。"):"融資融券數據尚未取得，暫不判斷利多或利空。",sentiment:validatedMargin?.financingChange!=null&&validatedMargin.shortChange!=null?(validatedMargin.financingChange<0&&validatedMargin.shortChange>0?"bearish":validatedMargin.financingChange>0&&validatedMargin.shortChange<0?"bullish":"neutral"):"neutral",verdict:validatedMargin?.financingChange!=null&&validatedMargin.shortChange!=null?(validatedMargin.financingChange<0&&validatedMargin.shortChange>0?"偏空":validatedMargin.financingChange>0&&validatedMargin.shortChange<0?"偏多":"多空分歧"):"資料待確認"},
  {title:"期貨與選擇權",body:"結論："+futuresSignal.verdict+"。"+futuresSignal.reason+"。"+(validatedFutures?.foreignTxNet!=null?"外資台指期淨部位 "+validatedFutures.foreignTxNet.toLocaleString("en-US")+" 口；":"")+(optionVolume!==null?"選擇權成交量 P/C "+optionVolume.toFixed(2)+"%；":"")+(optionOi!==null?"未平倉 P/C "+optionOi.toFixed(2)+"%。":"")+futuresInterpretation,sentiment:futuresSignal.sentiment,verdict:futuresSignal.verdict},
  {title:"匯率與利率",body:compact(["美元／台幣 "+pct(fx),"美元指數 "+pct(by("DX-Y.NYB")),"美債10年期指標 "+pct(by("^TNX"))]),sentiment:mood(fxScore),verdict:fxScore===null?"匯率待確認":fxScore>0?"台幣偏強，有利資金面":fxScore<0?"台幣偏弱，留意外資":"匯率影響中性"},
  {title:"VIX 市場情緒",body:vix?.value!=null?"VIX "+vix.value.toFixed(2)+"（"+pct(vix)+"）；數值越高，預期波動越大。":"VIX 最新數據尚未取得。",sentiment:mood(vixScore),verdict:vixScore===null?"待確認":vixScore>0?"市場較平靜":vixScore<0?"避險情緒升溫":"波動正常"},
  {title:"技術面與量能",body:"開盤先看能否站穩開盤價、量能是否放大及5日線位置。",sentiment:"neutral",verdict:"等開盤確認"},
  {title:"重大政策與科技",body:policySignals.items.length?policySignals.items.map((item,i)=>(i+1)+"．"+item.title+"｜影響："+item.sector+"｜"+(item.impact==="bullish"?"偏利多":"偏利空")+"："+item.reason+"。").join(" ")+(policySignals.score===0?" 綜合結論：利多利空交錯，短線偏中性。":policySignals.score!==null&&policySignals.score>0?" 綜合結論：政策與科技消息偏利多，仍須留意實際財報與市場反應。":" 綜合結論：政策與科技消息偏利空，注意相關族群風險。"):"近48小時未找到可由標題確認方向的重大政策或科技事件，暫不推論利多利空。",sentiment:mood(policySignals.score),verdict:policySignals.score===null?"事件待確認":policySignals.score>0?"消息偏利多":policySignals.score<0?"消息偏利空":"消息多空分歧"},
  {title:"今日盤前小總結",body:stance+"。"+allocationAdvice+" 優先確認開盤量價、台幣與法人方向；不追高，槓桿部位嚴守風控。",sentiment:mood(abroadScore),verdict:abroadScore===null?"資訊不足":abroadScore>0?"偏多觀察":abroadScore<0?"偏空謹慎":"中性觀望"}
 ];
 const missing=[!validatedMargin?"融資融券":null,validatedFutures?.foreignTxNet==null?"外資台指期":null,optionVolume===null?"選擇權成交量 P/C":null,optionOi===null?"選擇權未平倉 P/C":null,!foreign||!trust?"法人":null].filter((v):v is string=>v!==null);
 const dataComplete=missing.length===0;
 const firstEight=sections.slice(0,8);
 const bullishCount=firstEight.filter(item=>item.sentiment==="bullish").length;
 const bearishCount=firstEight.filter(item=>item.sentiment==="bearish").length;
 const neutralCount=firstEight.length-bullishCount-bearishCount;
 const overallDirection=bullishCount>bearishCount?"bullish":bearishCount>bullishCount?"bearish":"neutral";
 const overallLabel=overallDirection==="bullish"?"利多":overallDirection==="bearish"?"利空":"多空中性";
 const modelAvailable=allocationModel.allocation!==null;
 const baseAllocation=modelAvailable?Math.max(0,Math.min(90,allocationModel.allocation!)):null;
 const bearishLead=bearishCount-bullishCount;
 // Safety overlay: transparent conservative limits, not yet optimized by historical backtesting.
 const riskCap=bearishLead>=5?40:bearishLead>=3?50:bearishLead>=1?65:bearishLead===0?75:90;
 const recommendedAllocation=baseAllocation===null?null:Math.min(baseAllocation,riskCap);
 const allocationText=recommendedAllocation===null?"歷史回測資料暫不可用":recommendedAllocation+"%";
 const adjustmentText=baseAllocation!==null&&recommendedAllocation!==null&&recommendedAllocation<baseAllocation?"原始回測水位 "+baseAllocation+"%，因前八板塊偏空而依風險上限降至 "+recommendedAllocation+"%。":"目前未觸發額外減碼上限。";
 const confidenceNote=modelAvailable?"風險上限是保守規則，尚未完成含八板塊歷史訊號的回測驗證；不保證最佳報酬。":"歷史行情尚未取得，不提供未經計算的倉位百分比。";
 const overallStance=stance;
 const summary=sections.find(item=>item.title==="今日盤前小總結");
 if(summary){
  // Narrative recap: use only verified directional signals from the first eight cards.
  const narrative:string[]=[];
  const first=firstEight[0];
  if(first.sentiment==="bullish")narrative.push("國際股市與科技期貨表現偏強，外圍氣氛有利台股開盤。");
  else if(first.sentiment==="bearish")narrative.push("國際股市與科技期貨偏弱，台股開盤仍須提防賣壓。");
  const institution=firstEight[1];
  if(institution.sentiment==="bullish")narrative.push("法人籌碼呈現買超，顯示資金有回流跡象。");
  else if(institution.sentiment==="bearish")narrative.push("法人籌碼偏向賣超，反彈仍需觀察買盤能否延續。");
  const marginSection=firstEight[2];
  if(marginSection.sentiment==="bearish")narrative.push("融資融券顯示槓桿買盤降溫、空方部位增加，短線籌碼仍有壓力。");
  else if(marginSection.sentiment==="bullish")narrative.push("融資融券顯示槓桿買盤回升、空方回補，短線籌碼有所改善。");
  const futuresSection=firstEight[3];
  if(futuresSection.sentiment==="bearish")narrative.push("期貨與選擇權訊號偏空，市場避險情緒尚未完全解除。");
  else if(futuresSection.sentiment==="bullish")narrative.push("期貨與選擇權訊號轉強，有助於市場短線信心。");
  const currency=firstEight[4];
  if(currency.sentiment==="bearish")narrative.push("匯率與利率環境對資金面較不利，需留意外資動向。");
  else if(currency.sentiment==="bullish")narrative.push("匯率與利率環境相對有利，有助於資金風險偏好。");
  const volatility=firstEight[5];
  if(volatility.sentiment==="bearish")narrative.push("市場波動與避險情緒升溫，追價風險提高。");
  else if(volatility.sentiment==="bullish")narrative.push("市場波動相對平穩，短線風險情緒有所改善。");
  const policy=firstEight[7];
  if(policy.sentiment==="bearish")narrative.push("重大政策與科技消息偏向利空，相關族群仍須留意消息面壓力。");
  else if(policy.sentiment==="bullish")narrative.push("重大政策與科技消息偏向利多，可留意相關族群的資金反應。");
  if(narrative.length===0)narrative.push("目前盤前關鍵訊號尚不明朗，缺乏足夠依據判斷短線方向。");
  const conclusion=overallDirection==="bearish"
   ?"整體而言，短線反彈尚不足以確認行情轉強，建議保持審慎，等待量能、法人與匯率同步改善後，再逐步提高水位。"
   :overallDirection==="bullish"
   ?"整體而言，盤前多方訊號占優，但仍需觀察開盤量價能否延續，避免追高，採分批布局。"
   :"整體而言，多空訊號仍有分歧，建議維持中性水位，等待量能與資金方向更明確後再調整。";
  summary.body=narrative.slice(0,5).join(" ")+" "+conclusion;
  summary.sentiment=overallDirection;
  summary.verdict=overallLabel;
 }
 return NextResponse.json({status:"ok",reportDate,referenceDate,dataComplete,missingData:missing,generatedAt:new Date().toISOString(),scheduledAt:"08:30 Asia/Taipei",isAfterDailyCutoff:now.minute>=510,stance:overallStance,recommendedAllocation,riskCap,baseAllocation,quotes,sections,allocationBacktest:allocationModel,policyNews:policySignals.items,source:"Yahoo Finance / TWSE / TAIFEX / Wantgoo / Google News RSS",method:"依可取得數據產生規則式盤前分析，不是人工撰寫或經模型驗證的每日研究報告。部分行情可能延遲；資料不足的項目明確標示，不捏造籌碼數據。"},{headers:{"Cache-Control":"private, no-store"}});
}
