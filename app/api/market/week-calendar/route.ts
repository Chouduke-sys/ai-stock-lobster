import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Event={date:string;time:string;title:string;level:"high"|"medium"|"normal";region:string;detail:string;source:string};
function taiwanDay(iso:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(iso));}
function taiwanTime(iso:string){return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));}
function weekBounds(){const now=new Date();const today=taiwanDay(now);const date=new Date(today+"T12:00:00+08:00");const dow=date.getUTCDay();date.setUTCDate(date.getUTCDate()-((dow+6)%7));const monday=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+4);return {monday,friday:date.toISOString().slice(0,10)};}
function translate(title:string){const terms:[RegExp,string][]=[[/Federal Funds Rate|Federal Funds Target Rate/i,"聯準會利率決議"],[/FOMC Statement/i,"FOMC 政策聲明"],[/FOMC Press Conference/i,"聯準會主席記者會"],[/CPI m\/m/i,"美國 CPI 月增率"],[/Core CPI m\/m/i,"美國核心 CPI 月增率"],[/CPI y\/y/i,"美國 CPI 年增率"],[/Core PCE Price Index/i,"美國核心 PCE 物價指數"],[/Non-Farm Employment Change/i,"美國非農就業"],[/Unemployment Rate/i,"失業率"],[/GDP q\/q/i,"GDP 季增率"],[/PPI m\/m/i,"美國 PPI 月增率"],[/ISM Manufacturing PMI/i,"ISM 製造業 PMI"],[/Retail Sales m\/m/i,"美國零售銷售"],[/JOLTS Job Openings/i,"JOLTS 職缺"],[/Consumer Confidence/i,"消費者信心指數"]];return terms.find(([re])=>re.test(title))?.[1]??title;}
export async function GET(){
 const {monday,friday}=weekBounds();
 try{
  const res=await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json",{next:{revalidate:3600},signal:AbortSignal.timeout(6500),headers:{"Accept":"application/json"}});
  if(!res.ok)throw Error("行事曆來源 HTTP "+res.status);
  const raw=await res.json() as {title?:string;country?:string;date?:string;impact?:string;forecast?:string;previous?:string}[];
  if(!Array.isArray(raw))throw Error("行事曆格式異常");
  const events:Event[]=raw.flatMap(x=>{
   if(!x.title||!x.date||!["USD","TWD","CNY","JPY"].includes(x.country??""))return [];
   const instant=new Date(x.date);if(!Number.isFinite(instant.getTime()))return [];
   const date=taiwanDay(instant.toISOString());if(date<monday||date>friday)return [];
   const impact=(x.impact??"").toLowerCase();
   if(!["high","medium"].includes(impact))return [];
   return [{date,time:taiwanTime(instant.toISOString()),title:translate(x.title),level:impact as "high"|"medium",region:x.country==="USD"?"🇺🇸":x.country==="TWD"?"🇹🇼":x.country==="JPY"?"🇯🇵":"🌏",detail:[x.forecast&&"預期 "+x.forecast,x.previous&&"前值 "+x.previous].filter(Boolean).join(" · "),source:"Forex Factory 經濟行事曆"}];
  }).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  return NextResponse.json({status:"ok",monday,friday,events,notice:"僅顯示已取得來源的公告；企業法說會須另行核實，不臆測日期。",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=1800"}});
 }catch(e){return NextResponse.json({status:"unavailable",monday,friday,events:[],error:e instanceof Error?e.message:"來源暫不可用"},{status:503});}
}
