import { NextResponse } from "next/server";
export const runtime="nodejs";
type Obj=Record<string,unknown>;
type Item={symbol:string;name:string;market:"twse"|"tpex";foreign:number;trust:number;dealer:number;total:number};
type MarketData={date:string;rows:Item[];source:string};
const num=(v:unknown):number|null=>{
 if(typeof v==="number")return Number.isSafeInteger(v)?v:null;
 if(typeof v!=="string"||!/^[-+]?\d[\d,]*$/.test(v.trim()))return null;
 const n=Number(v.replace(/,/g,""));return Number.isSafeInteger(n)?n:null;
};
const pick=(r:Obj,keys:string[]):unknown=>{for(const k of keys)if(r[k]!==undefined&&r[k]!==null)return r[k];return null;};
const parseDate=(v:unknown):string|null=>{
 if(typeof v!=="string")return null;
 const s=v.trim();
 if(/^\d{7}$/.test(s))return String(Number(s.slice(0,3))+1911)+"-"+s.slice(3,5)+"-"+s.slice(5,7);
 if(/^\d{8}$/.test(s))return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8);
 const m=s.match(/(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
 return m?String(Number(m[1])+(m[1].length<=3?1911:0))+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0"):null;
};
function today(){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=(t:string)=>p.find(x=>x.type===t)?.value??"";
 return get("year")+"-"+get("month")+"-"+get("day");
}
async function twse():Promise<MarketData|null>{
 const start=new Date(today()+"T12:00:00+08:00");
 for(let i=0;i<8;i++){
  const d=new Date(start.getTime()-i*86400000).toISOString().slice(0,10);
  const url="https://www.twse.com.tw/rwd/zh/fund/T86?date="+d.replace(/-/g,"")+"&selectType=ALL&response=json";
  try{
   // T86 for recent sessions can intermittently fail or lag on one host.
   // Probe both official hosts for the latest three candidate dates, and accept
   // a response only when its verified trading date matches the requested date.
   const urls=i<3?[url,url.replace("www.twse.com.tw","wwwc.twse.com.tw")]:[url];
   const candidates=await Promise.all(urls.map(async endpoint=>{
    try{
     const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(4500)});
     return response.ok?await response.json() as unknown:null;
    }catch{return null;}
   }));
   const body=candidates.find(v=>v&&typeof v==="object"&&!Array.isArray(v)&&(v as Obj).stat==="OK");
   if(!body||typeof body!=="object"||Array.isArray(body))continue;
   const r=body as Obj;
   if(r.stat!=="OK"||!Array.isArray(r.fields)||!Array.isArray(r.data))continue;
   const names=["證券代號","證券名稱","外陸資買賣超股數(不含外資自營商)","投信買賣超股數","自營商買賣超股數","三大法人買賣超股數"];
   const indices=names.map(k=>(r.fields as string[]).indexOf(k));
   if(indices.some(k=>k<0))continue;
   const rows:Item[]=[];
   for(const item of r.data){
    if(!Array.isArray(item))continue;
    const symbol=String(item[indices[0]]??"").trim();
    if(!/^\d{4}$/.test(symbol))continue;
    const values=indices.slice(2).map(j=>num(item[j]));
    if(values.some(v=>v===null))continue;
    const [foreign,trust,dealer,total]=values as number[];
    if(Math.abs(foreign+trust+dealer-total)>1)continue;
    rows.push({symbol,name:String(item[indices[1]]??symbol).trim(),market:"twse",foreign,trust,dealer,total});
   }
   const date=parseDate(r.date)??d;
   if(rows.length&&date===d)return {date,rows,source:"TWSE T86"};
  }catch{continue;}
 }
 return null;
}
async function tpex():Promise<MarketData|null>{
 try{
  const response=await fetch("https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading",{next:{revalidate:300},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return null;
  const body:unknown=await response.json();if(!Array.isArray(body))return null;
  const rows:Item[]=[];let date:string|null=null;
  for(const item of body){
   if(!item||typeof item!=="object"||Array.isArray(item))continue;
   const r=item as Obj;
   const rowDate=parseDate(pick(r,["Date","date","日期"]));
   if(!rowDate)continue;
   if(date===null)date=rowDate;
   if(rowDate!==date)continue;
   const symbol=String(pick(r,["SecuritiesCompanyCode","SecuritiesCode","Code","證券代號"])??"").trim();
   if(!/^\d{4}$/.test(symbol))continue;
   const foreign=num(pick(r,["Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference","Foreign Investors include Mainland Area Investors (Foreign Dealers excluded) -Difference"]));
   const trust=num(pick(r,["SecuritiesInvestmentTrustCompanies-Difference"]));
   const dealer=num(pick(r,["Dealers-Difference"]));
   const total=num(pick(r,["TotalDifference"]));
   if(foreign===null||trust===null||dealer===null||total===null||Math.abs(foreign+trust+dealer-total)>1)continue;
   rows.push({symbol,name:String(pick(r,["CompanyName","SecuritiesCompanyName","SecuritiesName","Name","證券名稱"])??symbol),market:"tpex",foreign,trust,dealer,total});
  }
  return date&&rows.length?{date,rows,source:"TPEx 三大法人 OpenAPI"}:null;
 }catch{return null;}
}
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;
 const market=q.get("market")??"twse",investor=q.get("investor")??"all",side=q.get("side")??"buy";
 if(!["twse","tpex","all"].includes(market)||!["all","foreign","trust","dealer"].includes(investor)||!["buy","sell"].includes(side))
  return NextResponse.json({error:"查詢參數不正確"},{status:400});
 const [a,b]=await Promise.all([market!=="tpex"?twse():Promise.resolve(null),market!=="twse"?tpex():Promise.resolve(null)]);
 if((market==="twse"&&!a)||(market==="tpex"&&!b)||(market==="all"&&(!a||!b)))
  return NextResponse.json({error:"官方法人資料尚未完整取得，請稍後重試",availableDates:{twse:a?.date??null,tpex:b?.date??null}},{status:503});
 if(market==="all"&&a?.date!==b?.date)
  return NextResponse.json({error:"上市與上櫃資料日期不同，暫不合併排行",availableDates:{twse:a?.date,tpex:b?.date}},{status:409});
 const datasets=[a,b].filter((v):v is MarketData=>v!==null);
 const key=investor as "all"|"foreign"|"trust"|"dealer";
 const rows=datasets.flatMap(d=>d.rows.map(r=>({symbol:r.symbol,name:r.name,market:r.market,netShares:key==="all"?r.total:r[key]})))
  .sort((x,y)=>side==="buy"?y.netShares-x.netShares:x.netShares-y.netShares).slice(0,5);
 if(!rows.length)return NextResponse.json({error:"沒有可驗證的法人排行"},{status:503});
 return NextResponse.json({status:"ok",market,investor,side,dataDate:datasets[0].date,rows,dataSource:datasets.map(d=>d.source).join(" + "),isRealtime:false});
}
