import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Quote={label:string;symbol:string;value:number|null;changePct:number|null;time:string|null;source:string;trend5d:number[];trendDates:string[]};
type ChartResponse={chart?:{result?:Array<{meta?:{regularMarketPrice?:number;regularMarketTime?:number;exchangeTimezoneName?:string};timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>}};
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
async function getQuote(label:string,symbol:string):Promise<Quote>{
 const empty={label,symbol,value:null,changePct:null,time:null,source:"Yahoo Finance（非官方，可能延遲）",trend5d:[] as number[],trendDates:[] as string[]};
 try{
  // Five trading sessions can span more than five calendar days (weekends, holidays,
  // or an upstream delayed daily candle). Request a supported one-month window,
  // then keep only the latest five verified, exchange-dated points below.
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=1mo";
  const response=await fetch(url,{next:{revalidate:15},signal:AbortSignal.timeout(4000),headers:{"User-Agent":"Mozilla/5.0"}});
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
  return {...empty,value:quoteIsValid?value:null,changePct,time:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,trend5d:trend.map(p=>p.value),trendDates:trend.map(p=>p.date)};
 }catch{return empty;}
}
export async function GET(){
 const [us,semi,jp,kr,fx,oil]=await Promise.all([
  getQuote("美國那斯達克","^IXIC"),getQuote("費城半導體","^SOX"),getQuote("日本日經225","^N225"),getQuote("韓國KOSPI","^KS11"),getQuote("美元／新台幣","TWD=X"),getQuote("WTI原油","CL=F")
 ]);
 const twDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const signals=[us,semi,jp,kr].filter(q=>q.changePct!==null);
 const positive=signals.filter(q=>(q.changePct??0)>0).length,negative=signals.filter(q=>(q.changePct??0)<0).length;
 const marketView=!signals.length?"國際市場報價尚未齊全，暫不判定台股方向。":positive>negative?"國際股市偏多，對台股電子權值與市場情緒較有利；仍須觀察台股成交量與外資動向。":negative>positive?"國際市場偏弱，台股短線應留意權值股賣壓、開高走低及槓桿風險。":"國際股市多空分歧，台股可能呈現族群輪動，需觀察成交量與權值股表現。";
 const asia=jp.changePct===null||kr.changePct===null?"日韓股最新漲跌資料尚未齊全。":jp.changePct>0&&kr.changePct>0?"日韓股同步上漲，亞洲科技與風險性資產情緒偏正向。":jp.changePct<0&&kr.changePct<0?"日韓股同步下跌，需警惕亞洲資金風險偏好轉弱。":"日韓股走勢分歧，不能單憑單一市場判斷台股方向。";
 const currency=fx.changePct===null?"美元／新台幣匯價暫不可用，無法判定新台幣升貶。":fx.changePct>0?"美元／新台幣報價上升，代表新台幣相對美元走貶；出口商換匯可能受惠，但也須留意外資匯出壓力。":fx.changePct<0?"美元／新台幣報價下降，代表新台幣相對美元升值；有利進口成本，但出口商美元營收換算可能承壓。":"美元／新台幣匯率變動有限，仍須觀察外資流向。";
 const risk="觀察美國科技股及費半、日韓半導體族群、美元／新台幣方向與國際油價。盤中再以台股成交量、台積電及電子族群強弱確認，勿僅依單一指標追價。";
 return NextResponse.json({status:"ok",date:twDate,generatedAt:new Date().toISOString(),quotes:[us,semi,jp,kr,fx,oil],marketView,asia,currency,risk,method:"根據可取得的市場漲跌與匯率方向自動產生條件式分析；非投顧建議，並非新聞全文摘要。",source:"Yahoo Finance Chart（非官方）"},{headers:{"Cache-Control":"public, s-maxage=15, stale-while-revalidate=15"}});
}
