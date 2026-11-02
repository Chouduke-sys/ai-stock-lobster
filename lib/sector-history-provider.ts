import archive from "../data/sector-market-history.json";
import {sectors} from "./sector-universe";
import {cachedProvider} from "./provider-policy";
import {historyUrl,parseMarketHistory,validArchivedMarket,MarketHistory,SectorDay} from "./sector-history";

export async function sectorHistory(today:string):Promise<SectorDay[]> {
 const saved=(archive.days as SectorDay[]).filter(d=>d.markets.every(validArchivedMarket));
 const symbols=new Set(sectors.flatMap(g=>g.stocks));
 const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(today+"T00:00:00Z")-i*86400000)).filter(d=>![0,6].includes(d.getUTCDay())).slice(0,3).map(d=>d.toISOString().slice(0,10));
 const updates=await Promise.all(dates.map(async date=>{
  const existing=saved.find(d=>d.date===date);
  if(existing&&date!==today)return existing;
  const markets=await Promise.all((["twse","tpex"] as const).map(market=>cachedProvider<MarketHistory>("sector-history:"+market+":"+date,600000,async()=>{
   const response=await fetch(historyUrl(market,date),{next:{revalidate:600},signal:AbortSignal.timeout(6500)});
   if(!response.ok)return null;
   const parsed=parseMarketHistory(await response.json(),market,date);
   return parsed?{...parsed,rows:parsed.rows.filter(row=>symbols.has(row.symbol))}:null;
  })));
  return markets.every(Boolean)?{date,markets:markets as MarketHistory[]}:existing??null;
 }));
 const byDate=new Map(saved.map(day=>[day.date,day]));
 updates.forEach(day=>{if(day)byDate.set(day.date,day);});
 return [...byDate.values()].filter(day=>day.date<=today).sort((a,b)=>b.date.localeCompare(a.date));
}
