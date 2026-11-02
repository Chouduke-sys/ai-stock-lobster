import {cachedProvider} from "./provider-policy";
import {sectorHistory} from "./sector-history-provider";
import {officialStockHistory,stockAnalysis,compareSectors,type ResearchBar} from "./pro-research";
import {taipeiDate,taipeiMinute} from "./market-data";

async function yahooHistory(symbol:string,throughDate:string){
 for(const suffix of [".TW",".TWO"]){
  try{
   const result=await cachedProvider("pro:daily:"+symbol+suffix+":"+throughDate,600000,async()=>{
    const response=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol+suffix)+"?interval=1d&range=6mo",{next:{revalidate:600},signal:AbortSignal.timeout(6500)});
    if(!response.ok)return null;
    const data=await response.json(),series=data.chart?.result?.[0];
    if(!series||series.meta?.symbol!==symbol+suffix||!Array.isArray(series.timestamp))return null;
    const quote=series.indicators?.quote?.[0];
    const bars:ResearchBar[]=series.timestamp.flatMap((stamp:number,i:number)=>{
     const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(stamp*1000));
     return date<=throughDate&&Number.isFinite(quote?.close?.[i])&&quote.close[i]>0&&Number.isFinite(quote?.volume?.[i])?[{date,close:quote.close[i],volume:quote.volume[i]}]:[];
    });
    return bars.length?{bars,name:String(series.meta.longName??series.meta.shortName??symbol),source:"Yahoo Finance 日收盤資料（非官方，可能延遲）"}:null;
   });
   if(result)return result;
  }catch{}
 }
 return null;
}
export async function proResearch(symbol:string,lookback:number,now=new Date()){
 const today=taipeiDate(now);
 // Exclude the in-progress session. No intraday bar is labelled a daily close.
 const throughDate=taipeiMinute(now)>=810?today:new Date(Date.parse(today+"T00:00:00Z")-86400000).toISOString().slice(0,10);
 const days=await sectorHistory(today);
 const official=officialStockHistory(days,symbol,throughDate);
 const stock=official.bars.length>=20?{...official,source:"TWSE / TPEx 官方每日收盤行情封存"}:await yahooHistory(symbol,throughDate)??(official.bars.length?{...official,source:"TWSE / TPEx 官方歷史（樣本有限）"}:null);
 const analysis=stock?stockAnalysis(stock.bars,throughDate):null;
 const sectors=compareSectors(days,lookback,throughDate);
 return {symbol,name:stock?.name??symbol,source:stock?.source??null,analysis,sectors,lookback,
  throughDate,sectorDate:sectors[0]?.date??null,generatedAt:now.toISOString(),
  method:"日收盤有效樣本；MA 為簡單移動平均，RSI14 為 Wilder 平滑。價格未還原除權息；規則式摘要，非生成式 AI 或買賣建議。"};
}
