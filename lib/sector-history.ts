export type SectorQuote={symbol:string;name:string;value:number;close:number;volume:number};
export type MarketHistory={date:string;market:"twse"|"tpex";source:string;fetchedAt:string;total:number;rowCount:number;rows:SectorQuote[]};
export type SectorDay={date:string;markets:MarketHistory[]};
type Basket={name:string;chain:string;stocks:string[]};

function number(value:unknown):number|null {
 const text=String(value??"").trim().replace(/,/g,"");
 return /^\d+(?:\.\d+)?$/.test(text)?Number(text):null;
}
function dateOf(value:unknown){
 const match=String(value??"").match(/^(\d{3,4})[/-]?(\d{2})[/-]?(\d{2})$/);
 if(!match)return null;
 const date=(Number(match[1])+(match[1].length===3?1911:0))+"-"+match[2]+"-"+match[3];
 return Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:null;
}
export function historyUrl(market:"twse"|"tpex",date:string){
 return market==="twse"?"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=ALL&date="+date.replace(/-/g,""):
 "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?response=json&date="+date.replace(/-/g,"/");
}

/** Both exchanges now return tables[]. Never infer a response's date from the request. */
export function parseMarketHistory(json:any,market:"twse"|"tpex",expectedDate:string):MarketHistory|null {
 if(String(json?.stat).toLowerCase()!=="ok"||dateOf(json.date)!==expectedDate)return null;
 const tables:any[]=Array.isArray(json.tables)?[...json.tables]:[];
 for(const key of Object.keys(json))if(/^fields\d*$/.test(key))tables.push({fields:json[key],data:json[key.replace("fields","data")]});
 const quotes=new Map<string,SectorQuote>();
 for(const table of tables){
  if(!Array.isArray(table.fields)||!Array.isArray(table.data))continue;
  if(table.date&&dateOf(table.date)!==expectedDate)return null;
  const fields=table.fields.map((x:unknown)=>String(x).replace(/\s/g,""));
  const code=fields.findIndex((x:string)=>/^(證券代號|代號)$/.test(x));
  const amount=fields.findIndex((x:string)=>/^成交金額(?:\(元\))?$/.test(x));
  const close=fields.findIndex((x:string)=>/^(收盤價|收盤)$/.test(x));
  const volume=fields.findIndex((x:string)=>x==="成交股數");
  const name=fields.findIndex((x:string)=>/^(證券名稱|名稱)$/.test(x));
  if([code,amount,close,volume,name].some(i=>i<0))continue;
  for(const row of table.data){
   if(!Array.isArray(row))continue;
   const symbol=String(row[code]??"").trim();
   if(!/^\d{4}$/.test(symbol))continue; // ordinary shares, not warrants or ETFs
   const value=number(row[amount]),shares=number(row[volume]),price=number(row[close]);
   if(value===null||shares===null)continue;
   if(value>0&&(!(price!>0)||shares<=0))continue;
   const quote={symbol,name:String(row[name]).trim(),value,volume:shares,close:price??0};
   const previous=quotes.get(symbol);
   if(previous&&JSON.stringify(previous)!==JSON.stringify(quote))return null;
   quotes.set(symbol,quote);
  }
 }
 const rows=[...quotes.values()];
 const total=rows.reduce((sum,row)=>sum+row.value,0);
 return rows.length>=100&&total>0?{date:expectedDate,market,source:historyUrl(market,expectedDate),fetchedAt:new Date().toISOString(),total,rowCount:rows.length,rows}:null;
}

export function validArchivedMarket(value:any):value is MarketHistory {
 if(!value||dateOf(value.date)!==value.date||!["twse","tpex"].includes(value.market)||value.source!==historyUrl(value.market,value.date)||!Array.isArray(value.rows)||!Number.isInteger(value.rowCount)||value.rowCount<100||!Number.isFinite(value.total)||!(value.total>0))return false;
 const seen=new Set<string>();let subtotal=0;
 for(const row of value.rows){
  if(!/^\d{4}$/.test(row.symbol)||seen.has(row.symbol)||!Number.isFinite(row.value)||row.value<0||!Number.isFinite(row.close)||row.close<0||!Number.isFinite(row.volume)||row.volume<0)return false;
  seen.add(row.symbol);subtotal+=row.value;
 }
 return subtotal<=value.total;
}

/** Require both markets and exactly the same basket on every compared date. */
export function summarizeSectors(days:SectorDay[],baskets:Basket[],throughDate:string){
 const unique=new Map<string,SectorDay>();
 for(const day of days){
  if(day.date>throughDate||day.markets.length!==2||!day.markets.every(m=>validArchivedMarket(m)&&m.date===day.date)||new Set(day.markets.map(m=>m.market)).size!==2)continue;
  const symbols=day.markets.flatMap(m=>m.rows.map(row=>row.symbol));
  if(new Set(symbols).size!==symbols.length)continue;
  unique.set(day.date,day);
 }
 const ordered=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date));
 const latest=ordered[0];
 return baskets.map(basket=>{
  const series=ordered.slice(0,30).map(day=>{
   const rows=new Map(day.markets.flatMap(m=>m.rows).map(row=>[row.symbol,row]));
   const observed=basket.stocks.flatMap(symbol=>rows.has(symbol)?[rows.get(symbol)!]:[]);
   const complete=observed.length===basket.stocks.length;
   const total=day.markets.reduce((sum,m)=>sum+m.total,0);
   const turnover=complete?observed.reduce((sum,row)=>sum+row.value,0):null;
   return {date:day.date,turnover,share:turnover!==null?turnover/total*100:null,observed:observed.length,rows};
  });
  const current=series[0];
  // Do not skip holes and silently compare different constituents or distant sessions.
  const previous=series.slice(1,6);
  const complete=Boolean(current&&current.turnover!==null&&previous.length===5&&previous.every(d=>d.turnover!==null));
  const priorAverage=complete?previous.reduce((sum,d)=>sum+d.turnover!,0)/5:null;
  const weeklyDelta=complete?current.turnover!-priorAverage!:null;
  const weeklyChange=priorAverage!>0?weeklyDelta!/priorAverage!*100:null;
  const stocks=basket.stocks.flatMap(code=>current?.rows.has(code)?[current.rows.get(code)!]:[]).sort((a,b)=>b.value-a.value);
  const turnover=current?.turnover??stocks.reduce((sum,row)=>sum+row.value,0);
  const firstFour=series.slice(0,4);
  const priceMoves=firstFour.length===4?basket.stocks.flatMap(code=>{
   const a=firstFour[0].rows.get(code)?.close,b=firstFour[3].rows.get(code)?.close;
   return a!>0&&b!>0?[100*(a!/b!-1)]:[];
  }).sort((a,b)=>a-b):[];
  const middle=Math.floor(priceMoves.length/2);
  const medianPriceMove=priceMoves.length===basket.stocks.length?(priceMoves.length%2?priceMoves[middle]:(priceMoves[middle-1]+priceMoves[middle])/2):null;
  const risingSessions=complete?firstFour.slice(0,3).filter((d,i)=>d.turnover!>firstFour[i+1].turnover!).length:null;
  const shareDelta=complete?current.share!-firstFour.slice(1).reduce((sum,d)=>sum+d.share!,0)/3:null;
  const breadth=series.length>=2&&basket.stocks.every(code=>series[0].rows.get(code)?.close!>0&&series[1].rows.get(code)?.close!>0)?Math.round(100*basket.stocks.filter(code=>series[0].rows.get(code)!.close>series[1].rows.get(code)!.close).length/basket.stocks.length):null;
  const radarStatus=!complete||medianPriceMove===null?"insufficient":weeklyDelta!>0&&shareDelta!>0&&risingSessions!>=2&&medianPriceMove<3?"emerging":weeklyDelta!<0&&shareDelta!<0&&medianPriceMove<0?"cooling":"stable";
  const missingSymbols=basket.stocks.filter(code=>!current?.rows.has(code));
  return {...basket,turnover,stocks,expectedStocks:basket.stocks.length,observedStocks:stocks.length,coverageRatio:stocks.length/basket.stocks.length,
   weeklyDelta,weeklyChange,priorAverage,turnoverShare:current?.share??null,leaderShare:turnover>0?100*Math.max(0,...stocks.map(s=>s.value))/turnover:null,
   historicalQuality:complete?"verified":"insufficient",historyDays:previous.filter(d=>d.turnover!==null).length,historyDate:latest?.date??null,
   comparisonDates:complete?previous.map(d=>d.date):[],historyStart:ordered.at(-1)?.date??null,
   historySeries:series.map(({date,turnover,share,observed})=>({date,turnover,share,observed})).reverse(),
   historyReason:!current?"官方歷史來源暫不可用":missingSymbols.length?"最新日缺少成分股："+missingSymbols.join("、"):!complete?"近五個交易日的相同成分股資料尚未齊全":null,
   risingSessions,shareDelta,medianPriceMove,breadth,radarStatus};
 }).filter(g=>g.turnover>0).sort((a,b)=>(b.weeklyDelta??-Infinity)-(a.weeklyDelta??-Infinity)||b.turnover-a.turnover);
}
