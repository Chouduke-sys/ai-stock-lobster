export const MARKET_SOURCES=[
 {id:"yahoo",name:"Yahoo Finance／股市公開行情",capabilities:["quotes","index-close","institutional-rank"],access:"public",priority:10,url:"https://tw.stock.yahoo.com/"},
 {id:"finmind",name:"FinMind",capabilities:["calendar","institutional-total","margin","futures-position","institutional-rank"],access:"public; market-wide stock rows require a suitable token",priority:20,url:"https://finmind.github.io/"},
 {id:"histock",name:"HiStock",capabilities:["institutional-total","margin","turnover"],access:"public-page",priority:30,url:"https://histock.tw/"},
 {id:"twse",name:"TWSE",capabilities:["calendar","index-close","institutional-rank","margin"],access:"official-fallback",priority:90,url:"https://openapi.twse.com.tw/"},
 {id:"tpex",name:"TPEx",capabilities:["institutional-rank"],access:"official-fallback",priority:90,url:"https://www.tpex.org.tw/openapi/"},
 {id:"taifex",name:"TAIFEX",capabilities:["futures-position","options"],access:"official-fallback",priority:90,url:"https://openapi.taifex.com.tw/"}
];
type Observation={id:string;status:"ok"|"unavailable";checkedAt:string;dataDate:string|null};
const observations=new Map<string,Observation>();
const entries=new Map<string,{until:number;value:unknown;pending?:Promise<unknown>}>();
export function providerObservations(){return [...observations.values()];}
export async function cachedProvider<T>(key:string,ttlMs:number,task:()=>Promise<T|null>):Promise<T|null>{
 const current=entries.get(key);
 if(current?.pending)return current.pending as Promise<T|null>;
 if(current&&current.until>Date.now())return current.value as T|null;
 const entry={until:0,value:null as unknown,pending:undefined as Promise<unknown>|undefined};
 entry.pending=(async()=>{
  let value:T|null=null;
  try{value=await task();}catch{}
  const date=typeof value==="object"&&value!==null&&"date" in value?String((value as any).date):null;
  observations.set(key,{id:key,status:value===null?"unavailable":"ok",checkedAt:new Date().toISOString(),dataDate:date});
  entry.value=value;entry.until=Date.now()+(value===null?Math.min(ttlMs,30000):ttlMs);
  return value;
 })().finally(()=>{entry.pending=undefined;});
 entries.set(key,entry);
 if(entries.size>128)entries.delete(entries.keys().next().value!);
 return entry.pending as Promise<T|null>;
}
export async function firstValid<T>(providers:(()=>Promise<T|null>)[]):Promise<T|null>{
 for(const provider of providers){try{const value=await provider();if(value!==null)return value;}catch{}}
 return null;
}
