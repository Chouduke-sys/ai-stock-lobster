import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Row=Record<string,string>;
const sectors=[
 {name:"CCL／銅箔基板",chain:"上游材料",stocks:["2383","6274","6213","6672","1303"]},
 {name:"PCB／高階電路板",chain:"中游製造",stocks:["2368","2313","3044","4958","5439","2355"]},
 {name:"PCB 上游銅箔／玻纖",chain:"上游原料",stocks:["8358","1815","1802","5475"]},
 {name:"ABF／IC 載板",chain:"中游載板",stocks:["3037","3189","8046"]},
 {name:"先進封裝／CoWoS",chain:"晶片封裝",stocks:["2330","3711","2449","6239","3374"]},
 {name:"先進封裝設備",chain:"上游設備",stocks:["6187","3131","3680","6640"]},
 {name:"AI 伺服器／組裝",chain:"下游系統",stocks:["2317","2382","3231","6669","2356"]},
 {name:"散熱／液冷",chain:"零組件",stocks:["3017","3324","3653","2421"]},
 {name:"記憶體／DRAM／NAND",chain:"半導體記憶體",stocks:["2408","2344","2337","3260","8299","4967"]},
 {name:"重電／電網",chain:"電力設備",stocks:["1513","1519","1503","1514"]},
 {name:"航運",chain:"運輸",stocks:["2603","2609","2615","2618"]},
 {name:"金融",chain:"金融服務",stocks:["2881","2882","2891","2886","2884"]},
 {name:"高速網通／CPO",chain:"網通光電",stocks:["2345","6285","3450","4979"]},
 {name:"AI 電源／BBU",chain:"零組件",stocks:["2308","2301","6412","6781"]}
];
function num(v:unknown){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:0;}
function twDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
type HistoricalDay={date:string;values:Map<string,number>;closes:Map<string,number>;total:number};
async function fetchHistoricalDay(date:string):Promise<HistoricalDay|null>{
 try{
  const url="https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=ALL&date="+date.replace(/-/g,"");
  const res=await fetch(url,{next:{revalidate:21600},signal:AbortSignal.timeout(7000)});
  if(!res.ok)return null;
  const json=await res.json() as Record<string,unknown>;
  if(json.stat!=="OK")return null;
  let records:string[][]=[];let codeIndex=-1,amountIndex=-1,closeIndex=-1;
  // TWSE MI_INDEX includes several tables; find the stock-level table by field names.
  for(let n=0;n<=12;n++){
   const fields=json[n===0?"fields":"fields"+n],data=json[n===0?"data":"data"+n];
   if(!Array.isArray(fields)||!Array.isArray(data))continue;
   const labels=fields.map(String);
   if(labels.some(x=>x.includes("證券代號"))&&labels.some(x=>x.includes("成交金額"))){records=data as string[][];codeIndex=labels.findIndex(x=>x.includes("證券代號"));amountIndex=labels.findIndex(x=>x.includes("成交金額"));closeIndex=labels.findIndex(x=>x.includes("收盤價"));break;}
  }
  const values=new Map<string,number>();const closes=new Map<string,number>();
  for(const row of records){
   const code=String(row[codeIndex]??"").trim();
   if(!/^\d{4}$/.test(code))continue;
   // Identify trade value using the corresponding table's header rather than assuming a column.
   const amount=Number(String(row[amountIndex]??"").replace(/,/g,""));
   if(Number.isFinite(amount)&&amount>0)values.set(code,amount);
   if(closeIndex>=0){const close=Number(String(row[closeIndex]??"").replace(/,/g,""));if(Number.isFinite(close)&&close>0)closes.set(code,close);}
  }
  const total=Array.from(values.values()).reduce((sum,v)=>sum+v,0);
  return values.size>100?{date,values,closes,total}:null;
 }catch{return null;}
}
async function weeklyHistory(){
 const now=new Date();
 const taipei=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Taipei"}));
 const dates=Array.from({length:16},(_,i)=>{
  const d=new Date(taipei.getFullYear(),taipei.getMonth(),taipei.getDate()-i);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
 });
 const days=(await Promise.all(dates.map(fetchHistoricalDay))).filter((d):d is HistoricalDay=>d!==null).sort((a,b)=>b.date.localeCompare(a.date));
 return days.slice(0,6);
}
export async function GET(){
 try{
  const [dailyRes,instRes,history]=await Promise.all([
   fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",{next:{revalidate:300},signal:AbortSignal.timeout(8000)}),
   fetch("https://www.twse.com.tw/rwd/zh/fund/T86?date="+twDate().replace(/-/g,"")+"&selectType=ALL&response=json",{next:{revalidate:300},signal:AbortSignal.timeout(8000)}),
   weeklyHistory()
  ]);
  if(!dailyRes.ok)throw Error("證交所個股行情來源不可用");
  const raw=await dailyRes.json() as Row[];
  if(!Array.isArray(raw)||raw.length<100)throw Error("證交所個股行情資料不足");
  const rows=raw.flatMap(r=>{const symbol=String(r.Code??"").trim();if(!/^\d{4}$/.test(symbol))return [];const volume=num(r.TradeVolume),value=num(r.TradeValue),close=num(r.ClosingPrice);return [{symbol,name:r.Name??symbol,volume,value,close,change:r.Change??"",transactions:num(r.Transaction)}];});
  const bySymbol=new Map(rows.map(r=>[r.symbol,r]));
  const groups=sectors.map(g=>{const stocks=g.stocks.flatMap(code=>{const row=bySymbol.get(code);return row?[row]:[]});const turnover=stocks.reduce((sum,r)=>sum+r.value,0);const validDays=history.filter(d=>g.stocks.filter(code=>d.values.has(code)).length>=Math.ceil(g.stocks.length*.8));
   const current=validDays[0],previous=validDays.slice(1,6);
   const currentAmount=current&&g.stocks.every(code=>current.values.has(code))?g.stocks.reduce((sum,code)=>sum+current.values.get(code)!,0):null;
   const completePrevious=previous.filter(d=>g.stocks.every(code=>d.values.has(code)));
   const priorAverage=completePrevious.length>=3?completePrevious.reduce((sum,d)=>sum+g.stocks.reduce((v,code)=>v+d.values.get(code)!,0),0)/completePrevious.length:null;
   const weeklyChange=currentAmount!==null&&priorAverage!==null&&priorAverage>0?(currentAmount/priorAverage-1)*100:null;
   const weeklyDelta=currentAmount!==null&&priorAverage!==null?currentAmount-priorAverage:null;
   const turnoverShare=rows.reduce((sum,row)=>sum+row.value,0)>0?turnover/rows.reduce((sum,row)=>sum+row.value,0)*100:null;
   const leaderShare=turnover>0?Math.max(0,...stocks.map(stock=>stock.value))/turnover*100:null;
   const historicalQuality=weeklyDelta===null?"insufficient":"verified";
   const dailyAmounts=validDays.slice(0,5).map(d=>g.stocks.every(code=>d.values.has(code))?g.stocks.reduce((sum,code)=>sum+d.values.get(code)!,0):null);
   const dailyShares=validDays.slice(0,5).map((d,i)=>d.total>0&&dailyAmounts[i]!==null?dailyAmounts[i]!/d.total*100:null);
   const risingSessions=dailyAmounts.length>=4&&dailyAmounts.slice(0,4).every(v=>v!==null)?dailyAmounts.slice(0,3).filter((v,i)=>v!>dailyAmounts[i+1]!).length:null;
   const shareDelta=dailyShares.length>=4&&dailyShares.slice(0,4).every(v=>v!==null)?dailyShares[0]!-dailyShares.slice(1,4).reduce<number>((a,b)=>a+b!,0)/3:null;
   const priceMoves=validDays.length>=4?g.stocks.flatMap(code=>{const latest=validDays[0].closes.get(code),earlier=validDays[3].closes.get(code);return latest&&earlier?[latest/earlier-1]:[];}):[];
   const medianPriceMove=priceMoves.length>=Math.ceil(g.stocks.length*.7)?priceMoves.sort((a,b)=>a-b)[Math.floor(priceMoves.length/2)]*100:null;
   const risingStocks=validDays.length>=2?g.stocks.filter(code=>(validDays[0].closes.get(code)??0)>(validDays[1].closes.get(code)??Infinity)).length:null;
   const breadth=risingStocks!==null?Math.round(risingStocks/g.stocks.length*100):null;
   const radarStatus=weeklyDelta===null||shareDelta===null||medianPriceMove===null||risingSessions===null?"insufficient":weeklyDelta>0&&shareDelta>0&&risingSessions>=2&&medianPriceMove<3?"emerging":weeklyDelta<0&&shareDelta<0&&medianPriceMove<0?"cooling":"stable";
   return {...g,turnover,weeklyChange,weeklyDelta,turnoverShare,leaderShare,historicalQuality,risingSessions,shareDelta,medianPriceMove,breadth,radarStatus,historyDays:previous.length,historyDate:current?.date??null,stocks:stocks.sort((a,b)=>b.value-a.value).slice(0,5)};}).filter(g=>g.turnover>0).sort((a,b)=>(b.weeklyDelta??-Infinity)-(a.weeklyDelta??-Infinity)||b.turnover-a.turnover);
  const radar={hottest:[...groups].sort((a,b)=>b.turnover-a.turnover).slice(0,3),emerging:[...groups].filter(g=>g.radarStatus==="emerging").sort((a,b)=>(b.weeklyDelta??0)-(a.weeklyDelta??0)).slice(0,3),cooling:[...groups].filter(g=>g.radarStatus==="cooling").sort((a,b)=>(a.weeklyDelta??0)-(b.weeklyDelta??0)).slice(0,3)};
  const volumeLeaders=rows.filter(r=>r.volume>0&&r.close>0).sort((a,b)=>b.value-a.value).slice(0,15);
  let instDate:string|null=null;const buyers:{symbol:string;name:string;shares:number;volume:number;value:number}[]=[];
  if(instRes.ok){
   const data=await instRes.json() as {stat?:string;date?:string;fields?:string[];data?:string[][]};
   if(data.stat==="OK"&&Array.isArray(data.fields)&&Array.isArray(data.data)){
    const code=data.fields.indexOf("證券代號"),name=data.fields.indexOf("證券名稱"),total=data.fields.indexOf("三大法人買賣超股數");
    if(code>=0&&total>=0){instDate=data.date??null;for(const r of data.data){const symbol=String(r[code]??"").trim(),shares=num(r[total]);if(!/^\d{4}$/.test(symbol)||shares<=0)continue;const quote=bySymbol.get(symbol);buyers.push({symbol,name:r[name]??quote?.name??symbol,shares,volume:quote?.volume??0,value:quote?.value??0});}}
   }
  }
  buyers.sort((a,b)=>b.shares-a.shares);
  return NextResponse.json({status:"ok",asOf:history[0]?.date??twDate(),historyStatus:history.length>=4?"available":"insufficient",historicalSessions:history.length,groups,radar,topSector:groups[0]??null,volumeLeaders,buyers:buyers.slice(0,15),institutionalDate:instDate,source:"TWSE STOCK_DAY_ALL / T86 / MI_INDEX 近週歷史",note:"族群按本站公開成分股清單計算成交金額，不等於淨資金流入；大戶以三大法人當日買超作代理，不等於主力或單一大戶。資料為最近取得的盤後快照，並非逐筆即時。"},
   {headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
 }catch(e){return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"暫無可驗證行情"},{status:503});}
}
