import {indicators,type Candle} from "./technical";
import {sectors} from "./sector-universe";
import {type SectorDay} from "./sector-history";

export type ResearchBar={date:string;close:number;volume:number};
export type WatchItem={symbol:string;name:string;note:string};
export function parseWatchlist(raw:string|null):WatchItem[]{
 try{
  const input=JSON.parse(raw??"[]");if(!Array.isArray(input))return [];
  const seen=new Set<string>();
  return input.flatMap(item=>{
   if(!item||typeof item.symbol!=="string"||!/^\d{4}$/.test(item.symbol)||seen.has(item.symbol))return [];
   seen.add(item.symbol);
   return [{symbol:item.symbol,name:typeof item.name==="string"?item.name.slice(0,40):item.symbol,note:typeof item.note==="string"?item.note.slice(0,500):""}];
  }).slice(0,20);
 }catch{return [];}
}
export function stockAnalysis(raw:ResearchBar[],throughDate:string){
 const bars=[...new Map(raw.filter(b=>/^\d{4}-\d{2}-\d{2}$/.test(b.date)&&b.date<=throughDate&&Number.isFinite(b.close)&&b.close>0&&Number.isFinite(b.volume)&&b.volume>=0).map(b=>[b.date,b])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 const candles:Candle[]=bars.map(b=>({...b,open:b.close,high:b.close,low:b.close}));
 const metrics=indicators(candles),last=bars.at(-1),prior=bars.at(-2),i=bars.length-1;
 const change=(n:number)=>bars.length>n?100*(last!.close/bars[i-n].close-1):null;
 const ma5=metrics.ma5[i]??null,ma20=metrics.ma20[i]??null,rsi14=metrics.rsi14[i]??null;
 const volumeMean=bars.length>=6?bars.slice(-6,-1).reduce((sum,b)=>sum+b.volume,0)/5:null;
 const volumeRatio=volumeMean!>0?last!.volume/volumeMean!:null;
 const summary:string[]=[];
 if(last&&ma20!==null)summary.push(`${last.date} 收盤 ${last.close.toFixed(2)} 元，${last.close>=ma20?"高於或等於":"低於"} 20 日均線 ${ma20.toFixed(2)} 元。`);
 if(rsi14!==null)summary.push(`RSI14 為 ${rsi14.toFixed(1)}，${rsi14>=70?"短期動能偏熱，不代表即將反轉":rsi14<=30?"短期動能偏弱，不代表已止跌":"位於 30～70 區間"}。`);
 if(volumeRatio!==null)summary.push(`成交股數為前五個有效交易日均量的 ${volumeRatio.toFixed(2)} 倍；量能變化不等於資金淨流入。`);
 if(!summary.length)summary.push("有效歷史樣本不足，暫不產生技術判讀。");
 return {bars,sampleDays:bars.length,date:last?.date??null,close:last?.close??null,dayChangePct:last&&prior?100*(last.close/prior.close-1):null,change5:change(5),change20:change(20),ma5,ma20,rsi14,volumeRatio,summary};
}
export function compareSectors(days:SectorDay[],lookback:number,throughDate:string){
 const ordered=days.filter(d=>d.date<=throughDate&&d.markets.length===2&&new Set(d.markets.map(m=>m.market)).size===2).sort((a,b)=>b.date.localeCompare(a.date));
 const window=ordered.slice(0,lookback+1);
 return sectors.map(sector=>{
  const observations=window.map(day=>{
   const rows=new Map(day.markets.flatMap(m=>m.rows).map(row=>[row.symbol,row]));
   const complete=sector.stocks.every(code=>rows.has(code));
   const total=day.markets.reduce((sum,m)=>sum+m.total,0);
   const value=complete?sector.stocks.reduce((sum,code)=>sum+rows.get(code)!.value,0):null;
   return {date:day.date,value,share:value!==null&&total>0?100*value/total:null};
  });
  const valid=observations.length===lookback+1&&observations.every(d=>d.value!==null);
  const average=valid?observations.slice(1).reduce((sum,d)=>sum+d.value!,0)/lookback:null;
  const amount=observations[0]?.value??null;
  return {name:sector.name,date:observations[0]?.date??null,amount,average,delta:valid?amount!-average!:null,share:observations[0]?.share??null,observations:observations.reverse(),complete:valid};
 }).sort((a,b)=>(b.delta??-Infinity)-(a.delta??-Infinity));
}
export function officialStockHistory(days:SectorDay[],symbol:string,throughDate:string){
 const bars:ResearchBar[]=[];let name=symbol;
 for(const day of [...days].sort((a,b)=>a.date.localeCompare(b.date))){
  if(day.date>throughDate)continue;
  const row=day.markets.flatMap(m=>m.rows).find(r=>r.symbol===symbol);
  if(row&&row.close>0){bars.push({date:day.date,close:row.close,volume:row.volume});name=row.name;}
 }
 return {bars,name};
}
export function researchText(name:string,symbol:string,analysis:ReturnType<typeof stockAnalysis>,source:string){
 return `${name} (${symbol})\n資料日：${analysis.date??"無資料"}\n來源：${source}\n\n${analysis.summary.join("\n")}\n\n依數據規則整理，非生成式 AI 預測；未還原除權息，歷史指標不保證未來表現。`;
}
