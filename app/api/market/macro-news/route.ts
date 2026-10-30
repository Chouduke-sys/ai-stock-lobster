import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Raw={title?:string;country?:string;date?:string;impact?:string;forecast?:string;previous?:string;actual?:string};
const allowed=/CPI|PCE|Non-Farm|Unemployment Rate|Federal Funds|FOMC|GDP|ISM Manufacturing|Retail Sales|PPI|JOLTS/i;
const japan=/CPI|Consumer Price Index|BOJ Policy Rate|Bank of Japan.*(?:Rate Decision|Interest Rate)/i;
function tw(iso:string){return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));}
function title(t:string){return t.replace(/Federal Funds Rate|Federal Funds Target Rate/gi,"聯準會利率決議").replace(/Non-Farm Employment Change/gi,"美國非農就業").replace(/Core CPI/gi,"核心 CPI").replace(/Unemployment Rate/gi,"失業率").replace(/FOMC Statement/gi,"FOMC 政策聲明").replace(/BOJ Policy Rate/gi,"日本央行利率決議");}
export async function GET(){
 try{
  const response=await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json",{next:{revalidate:300},signal:AbortSignal.timeout(6500),headers:{"Accept":"application/json"}});
  if(!response.ok)throw Error("上游 "+response.status);
  const raw=await response.json() as Raw[];
  if(!Array.isArray(raw))throw Error("資料格式異常");
  const now=Date.now();
  const events=raw.flatMap(e=>{
   if(!e.title||!e.date||!["USD","JPY"].includes(e.country??""))return [];
   if(e.country==="JPY"?!japan.test(e.title):!allowed.test(e.title))return [];
   if(!["high","medium"].includes((e.impact??"").toLowerCase()))return [];
   const ms=Date.parse(e.date);if(!Number.isFinite(ms)||Math.abs(ms-now)>4*86400000)return [];
   const actual=typeof e.actual==="string"&&e.actual.trim()?e.actual.trim():null;
   const forecast=e.forecast?.trim()||null,previous=e.previous?.trim()||null;
   const status=actual?"released":ms>now?"upcoming":"awaiting";
   return [{id:e.country+"-"+e.title+"-"+e.date,date:e.date,time:tw(e.date),title:(e.country==="JPY"?"🇯🇵 ":"🇺🇸 ")+title(e.title),importance:e.impact,status,actual,forecast,previous,source:"Forex Factory",sourceUrl:"https://www.forexfactory.com/calendar"}];
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return NextResponse.json({status:"ok",events,updatedAt:new Date().toISOString(),notice:"公布值僅在來源明確提供 actual 時顯示；預測值不得當作實際值。"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=120"}});
 }catch(e){return NextResponse.json({status:"unavailable",events:[],error:e instanceof Error?e.message:"資料來源不可用"},{status:503});}
}
