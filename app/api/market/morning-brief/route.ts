import {getServerSession} from "next-auth";
import {authOptions} from "../../../../lib/auth";
import {NextResponse} from "next/server";
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
async function latestMargin():Promise<MarginData|null>{
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
export async function GET(request:Request){
 const cronAuthorized=Boolean(process.env.CRON_SECRET)&&request.headers.get("authorization")==="Bearer "+process.env.CRON_SECRET;
 const session=await getServerSession(authOptions);
 if(!session?.user&&!cronAuthorized)return NextResponse.json({status:"unauthorized",error:"請先使用 Google 或 Apple 帳號登入，才能查看每日 08:30 台股盤前分析。"},{status:401,headers:{"Cache-Control":"private, no-store"}});
 const now=taipeiParts(),reportDate=now.minute>=510?now.date:new Date(Date.parse(now.date+"T00:00:00+08:00")-86400000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
 const [quotes,twse,news,margin]=await Promise.all([
  Promise.all(symbols.map(quote)),
  fetch("https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("https://news.google.com/rss/search?q="+encodeURIComponent("台股 外資 投信 融資 台幣 聯準會 川普 when:2d")+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.text():"").catch(()=>""),
  latestMargin()
 ]);
 const by=(symbol:string)=>quotes.find(q=>q.symbol===symbol);
 const us=by("ES=F"),tech=by("NQ=F"),semi=by("^SOX"),fx=by("TWD=X"),vix=by("^VIX");
 const pct=(q:Q|undefined)=>q?.changePct==null?"資料待確認":(q.changePct>=0?"+":"")+q.changePct.toFixed(2)+"%";
 const signals=[us,tech,semi].filter(q=>q?.changePct!=null) as Q[];
 const positive=signals.filter(q=>(q.changePct??0)>0).length,negative=signals.filter(q=>(q.changePct??0)<0).length;
 const stance=!signals.length?"資料不足，暫不判斷方向":positive>negative?"國際科技與期貨風險偏好偏正向":negative>positive?"國際科技與期貨走弱，短線宜保守":"多空訊號分歧，偏向區間震盪";
 const flow=twse&&typeof twse==="object"?twse as {date?:string;data?:string[][];fields?:string[]}:null;
 const flowRows=Array.isArray(flow?.data)?flow!.data!.slice(0,8).map(row=>row.join("／")).filter(Boolean):[];
 const parseMoney=(value:string)=>{const n=Number(value.replace(/,/g,"").replace(/\\s/g,""));return Number.isFinite(n)?n:null;};
 const investorRows=(flow?.data??[]).flatMap(row=>{const label=String(row[0]??"");if(!/外資|投信|自營商/.test(label))return [];const value=parseMoney(String(row[row.length-1]??""));return value===null?[]:[{label,value}];});
 const foreign=investorRows.find(row=>/外資/.test(row.label)),trust=investorRows.find(row=>/投信/.test(row.label));
 const investorScore=foreign&&trust?(foreign.value+trust.value>0?1:foreign.value+trust.value<0?-1:0):null;
 const moneyLabel=(row:{label:string;value:number}|undefined)=>row?row.label+" "+(row.value>=0?"+":"")+(row.value/1e8).toFixed(1)+"億":"未取得";
 const title=news.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&")??null;
 const mood=(score:number|null)=>score===null?"neutral":score>0?"bullish":score<0?"bearish":"neutral";
 const scoreOf=(q:Q|undefined,invert=false)=>q?.changePct==null?null:Math.abs(q.changePct)<0.05?0:(q.changePct>0?1:-1)*(invert?-1:1);
 const abroadScore=signals.length?positive>negative?1:negative>positive?-1:0:null;
 const fxScore=scoreOf(fx,true);
 const vixScore=vix?.value==null?null:vix.value>=30?-1:vix.value>=25?-1:vix.value<15?1:0;
 const compact=(items:string[])=>items.join("；")+"。";
 const sections=[
  {title:"美股與期貨",body:compact(["標普期 "+pct(us),"那指期 "+pct(tech),"費半 "+pct(semi)]),sentiment:mood(abroadScore),verdict:abroadScore===null?"待確認":abroadScore>0?"外圍偏多":abroadScore<0?"外圍偏空":"多空分歧"},
  {title:"外資與投信",body:foreign||trust?"最近公布 "+(flow?.date??"日期未提供")+"："+moneyLabel(foreign)+"；"+moneyLabel(trust)+"（新台幣，非當日盤前數據）。":"法人買賣超暫無可靠數字。",sentiment:mood(investorScore),verdict:investorScore===null?"籌碼待確認":investorScore>0?"法人合計偏買":investorScore<0?"法人合計偏賣":"法人買賣相抵"},
  {title:"融資融券",body:margin?"最近公布 "+margin.date+"（盤前沿用上一交易日，非今日盤中）：「融資餘額」"+margin.financingBalance?.toLocaleString("en-US")+"；「融券餘額」"+margin.shortBalance?.toLocaleString("en-US")+(margin.financingChange!==null?"；融資增減 "+(margin.financingChange!>=0?"+":"")+margin.financingChange?.toLocaleString("en-US"):"")+(margin.shortChange!==null?"；融券增減 "+(margin.shortChange!>=0?"+":"")+margin.shortChange?.toLocaleString("en-US"):"")+"。來源："+margin.source+"；數量單位依交易所表格。":"最新已公布交易日的資券統計暫時無法取得，請參考 Yahoo 股市資券餘額頁：https://tw.stock.yahoo.com/margin-balance",sentiment:margin?.financingChange==null?"neutral":margin.financingChange>0?"bullish":margin.financingChange<0?"bearish":"neutral",verdict:margin?"已更新 "+margin.date:"資料待更新"},
  {title:"期貨與選擇權",body:"外資期貨未平倉、Put/Call 比尚無有效數字。",sentiment:"neutral",verdict:"籌碼待確認"},
  {title:"匯率與利率",body:compact(["美元／台幣 "+pct(fx),"美元指數 "+pct(by("DX-Y.NYB")),"美債10年期指標 "+pct(by("^TNX"))]),sentiment:mood(fxScore),verdict:fxScore===null?"匯率待確認":fxScore>0?"台幣偏強，有利資金面":fxScore<0?"台幣偏弱，留意外資":"匯率影響中性"},
  {title:"VIX 市場情緒",body:vix?.value!=null?"VIX "+vix.value.toFixed(2)+"（"+pct(vix)+"）；數值越高，預期波動越大。":"VIX 最新數據尚未取得。",sentiment:mood(vixScore),verdict:vixScore===null?"待確認":vixScore>0?"市場較平靜":vixScore<0?"避險情緒升溫":"波動正常"},
  {title:"技術面與量能",body:"開盤先看能否站穩開盤價、量能是否放大及5日線位置。",sentiment:"neutral",verdict:"等開盤確認"},
  {title:"重大政策與科技",body:title?"焦點新聞："+title.slice(0,85)+(title.length>85?"…":""):"關注聯準會、川普政策與AI供應鏈；暫無可核對重大標題。",sentiment:"neutral",verdict:"事件影響待確認"},
  {title:"今日盤前小總結",body:stance+"。優先確認開盤量價、台幣與法人方向；不追高，槓桿部位嚴守風控。",sentiment:mood(abroadScore),verdict:abroadScore===null?"資訊不足":abroadScore>0?"偏多觀察":abroadScore<0?"偏空謹慎":"中性觀望"}
 ];
 return NextResponse.json({status:"ok",reportDate,generatedAt:new Date().toISOString(),scheduledAt:"08:30 Asia/Taipei",isAfterDailyCutoff:now.minute>=510,stance,quotes,sections,source:"Yahoo Finance / TWSE / Google News RSS",method:"依可取得數據產生規則式盤前分析，不是人工撰寫或經模型驗證的每日研究報告。部分行情可能延遲；資料不足的項目明確標示，不捏造籌碼數據。"},{headers:{"Cache-Control":"private, no-store"}});
}
