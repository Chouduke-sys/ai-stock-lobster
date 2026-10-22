import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Quote={label:string;symbol:string;value:number|null;changePct:number|null;time:string|null;source:string;trend5d:number[];trendDates:string[]};
type ChartResponse={chart?:{result?:Array<{meta?:{regularMarketPrice?:number;chartPreviousClose?:number;previousClose?:number;regularMarketTime?:number};timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>}};
async function getQuote(label:string,symbol:string):Promise<Quote>{
 const empty={label,symbol,value:null,changePct:null,time:null,source:"Yahoo Finance（非官方，可能延遲）",trend5d:[] as number[],trendDates:[] as string[]};
 try{
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=5d";
  const response=await fetch(url,{next:{revalidate:300},signal:AbortSignal.timeout(4000),headers:{"User-Agent":"Mozilla/5.0"}});
  if(!response.ok)return empty;
  const body=await response.json() as ChartResponse;
  const result=body.chart?.result?.[0];
  const meta=result?.meta;
  const closes=result?.indicators?.quote?.[0]?.close??[];
  const timestamps=result?.timestamp??[];
  const history=closes.flatMap((close,i)=>typeof close==="number"&&Number.isFinite(close)&&close>0&&typeof timestamps[i]==="number"?[{value:close,date:new Date(timestamps[i]*1000).toISOString().slice(0,10)}]:[]).slice(-5);
  const value=meta?.regularMarketPrice,prev=meta?.chartPreviousClose??meta?.previousClose;
  return {...empty,value:typeof value==="number"?value:null,changePct:typeof value==="number"&&typeof prev==="number"&&prev>0?(value/prev-1)*100:null,time:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,trend5d:history.map(p=>p.value),trendDates:history.map(p=>p.date)};
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
 return NextResponse.json({status:"ok",date:twDate,generatedAt:new Date().toISOString(),quotes:[us,semi,jp,kr,fx,oil],marketView,asia,currency,risk,method:"根據可取得的市場漲跌與匯率方向自動產生條件式分析；非投顧建議，並非新聞全文摘要。",source:"Yahoo Finance Chart（非官方）"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
}
