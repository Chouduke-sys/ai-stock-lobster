import {isQuoteFresh} from "./market-data";
export type Quote={openPrice?:number|null;openDate?:string|null;quoteDate:string|null;referenceDate:string|null;referencePrice:number|null;label:string;symbol:string;value:number|null;changePct:number|null;time:string|null;source:string;trend5d:number[];trendDates:string[]};
type ChartResponse={chart?:{result?:Array<{meta?:{regularMarketPrice?:number;regularMarketTime?:number;exchangeTimezoneName?:string};timestamp?:number[];indicators?:{quote?:Array<{open?:(number|null)[];close?:(number|null)[]}>}}>}};
// Yahoo chartPreviousClose can refer to the start of the requested range rather than
// the previous trading session. Use dated daily closes instead for daily % moves.
function exchangeDate(timestamp:number,timeZone:string):string{
 try{
  return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(timestamp*1000));
 }catch{return new Date(timestamp*1000).toISOString().slice(0,10);}
}
// A missing weekday candle must not turn a two-day move into a "daily" move.
// Exchange holidays may conservatively yield null until a dated prior close exists.
function weekdaysBetween(from:string,to:string):number|null{
 const start=Date.parse(from+"T00:00:00Z"),end=Date.parse(to+"T00:00:00Z");
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>31*86400000)return null;
 let count=0;
 for(let t=start+86400000;t<=end;t+=86400000){const d=new Date(t).getUTCDay();if(d!==0&&d!==6)count++;}
 return count;
}
export async function getQuote(label:string,symbol:string):Promise<Quote>{
 const empty={quoteDate:null,referenceDate:null,referencePrice:null,label,symbol,value:null,changePct:null,time:null,source:"Yahoo Finance（非官方，可能延遲）",trend5d:[] as number[],trendDates:[] as string[]};
 try{
  // Five trading sessions can span more than five calendar days (weekends, holidays,
  // or an upstream delayed daily candle). Request a supported one-month window,
  // then keep only the latest five verified, exchange-dated points below.
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=1mo";
  const response=await fetch(url,{next:{revalidate:5},signal:AbortSignal.timeout(4000),headers:{"User-Agent":"Mozilla/5.0"}});
  if(!response.ok)return empty;
  const body=await response.json() as ChartResponse;
  const result=body.chart?.result?.[0];
  const meta=result?.meta;
  const closes=result?.indicators?.quote?.[0]?.close??[];
  const timestamps=result?.timestamp??[];
  const timeZone=meta?.exchangeTimezoneName||"UTC";
  const history=closes.flatMap((close,i)=>typeof close==="number"&&Number.isFinite(close)&&close>0&&typeof timestamps[i]==="number"?[{value:close,date:exchangeDate(timestamps[i],timeZone)}]:[]).slice(-5);
  const value=meta?.regularMarketPrice;
  const quoteDate=typeof meta?.regularMarketTime==="number"?exchangeDate(meta.regularMarketTime,timeZone):null;
  const openIndex=timestamps.findIndex(stamp=>exchangeDate(stamp,timeZone)===quoteDate);
  const rawOpen=openIndex>=0?result?.indicators?.quote?.[0]?.open?.[openIndex]:null;
  const openPrice=typeof rawOpen==="number"&&Number.isFinite(rawOpen)&&rawOpen>0?rawOpen:null;
  const latest=history.at(-1);
  // If the chart includes the quote's trading session, compare with the prior
  // session; if the chart stops before it, the last close is the prior session.
  // Missing/misaligned sessions produce null, never a fabricated percentage.
  const gapDays=latest&&quoteDate?(Date.parse(quoteDate+"T00:00:00Z")-Date.parse(latest.date+"T00:00:00Z"))/86400000:null;
  const prior=history.at(-2);
  const previousClose=latest&&quoteDate&&latest.date===quoteDate
    ?prior&&weekdaysBetween(prior.date,quoteDate)===1?prior.value:null
    :latest&&quoteDate&&weekdaysBetween(latest.date,quoteDate)===1?latest.value:null;
  const changePct=typeof value==="number"&&Number.isFinite(value)&&value>0&&
    typeof previousClose==="number"&&previousClose>0?(value/previousClose-1)*100:null;
  // Yahoo may publish the latest regular-market quote before its daily chart
  // includes that session (observed for Nikkei/KOSPI). Include the same-symbol,
  // exchange-dated quote as a provisional last trend point, never as a fabricated
  // historical close. Keep the change calculation anchored to the real prior close.
  const quoteIsValid=typeof value==="number"&&Number.isFinite(value)&&value>0;
  const trend=quoteIsValid&&quoteDate&&latest&&gapDays!==null&&gapDays>0&&gapDays<=4
    ?[...history,{date:quoteDate,value}].slice(-5)
    :history;
  const quoteTime=meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null;
  const maxAge=/=F$/.test(symbol)?12*3600000:96*3600000;
  if(!isQuoteFresh(quoteTime,maxAge))return empty;
  return {...empty,openPrice,openDate:openPrice===null?null:quoteDate,quoteDate,referencePrice:previousClose,referenceDate:previousClose===null?null:latest?.date===quoteDate?prior?.date??null:latest?.date??null,value:quoteIsValid?value:null,changePct,time:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,trend5d:trend.map(p=>p.value),trendDates:trend.map(p=>p.date)};
 }catch{return empty;}
}
