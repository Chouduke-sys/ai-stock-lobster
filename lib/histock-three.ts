import {extractHtmlTables,parseMarketNumber} from "./market-table-extractor";
export type HiStockThree={date:string;foreignYi:number;trustYi:number;dealerYi:number;totalYi:number;foreignFuturesNet:number|null;source:string};
function dateOf(raw:string):string|null{
 const m=raw.trim().match(/^(?:(20\d{2})[/-])?(\d{1,2})[/-](\d{1,2})$/);
 if(!m)return null;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"numeric"}).formatToParts(new Date());
 const y=Number(parts.find(p=>p.type==="year")?.value),monthNow=Number(parts.find(p=>p.type==="month")?.value);
 const month=Number(m[2]),day=Number(m[3]);
 if(month<1||month>12||day<1||day>31)return null;
 const year=m[1]?Number(m[1]):month>monthNow+1?y-1:y;
 const date=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
 return Number.isNaN(Date.parse(date))?null:date;
}
export async function fetchHiStockThree():Promise<HiStockThree|null>{
 try{
  const res=await fetch("https://histock.tw/stock/three.aspx",{next:{revalidate:60},signal:AbortSignal.timeout(8000),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!res.ok)return null;
  const tables=extractHtmlTables(await res.text());
  const institution=tables.find(t=>t.headers.some(h=>h.includes("外資"))&&t.headers.some(h=>h.includes("投信"))&&t.headers.some(h=>h.includes("總計"))&&t.rows.some(r=>dateOf(r[0]??"")));
  if(!institution)return null;
  const index=(pattern:RegExp)=>institution.headers.findIndex(h=>pattern.test(h));
  const fi=index(/外資/),ti=index(/投信/),di=index(/自營.*總/),total=index(/總計/);
  if([fi,ti,di,total].some(n=>n<0))return null;
  const row=institution.rows.find(r=>dateOf(r[0]??"")&&[fi,ti,di,total].every(i=>parseMarketNumber(r[i]??"")!==null));
  if(!row)return null;
  const date=dateOf(row[0])!,foreignYi=parseMarketNumber(row[fi])!,trustYi=parseMarketNumber(row[ti])!,dealerYi=parseMarketNumber(row[di])!,totalYi=parseMarketNumber(row[total])!;
  if(Math.abs(foreignYi+trustYi+dealerYi-totalYi)>1.5)return null;
  const futures=tables.find(t=>t!==institution&&t.headers.some(h=>h.includes("外資"))&&t.headers.some(h=>h.includes("投信"))&&t.rows.some(r=>dateOf(r[0]??"")));
  const futuresRow=futures?.rows.find(r=>dateOf(r[0]??"")===date);
  const futuresIndex=futures?.headers.findIndex(h=>h.includes("外資"))??-1;
  const foreignFuturesNet=futuresRow&&futuresIndex>=0?parseMarketNumber(futuresRow[futuresIndex]??""):null;
  return {date,foreignYi,trustYi,dealerYi,totalYi,foreignFuturesNet,source:"HiStock 上市三大法人與台指期留倉"};
 }catch{return null;}
}
