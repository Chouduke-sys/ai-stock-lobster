import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Event={date:string;time:string;title:string;level:"high"|"medium"|"normal";region:string;detail:string;source:string};
function taiwanDay(iso:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(iso));}
function taiwanTime(iso:string){return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));}
function weekBounds(){const now=new Date();const today=taiwanDay(now.toISOString());const date=new Date(today+"T12:00:00+08:00");const dow=date.getUTCDay();date.setUTCDate(date.getUTCDate()-((dow+6)%7));const monday=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+4);return {monday,friday:date.toISOString().slice(0,10)};}
function translate(title:string){const terms:[RegExp,string][]=[[/Federal Funds Rate|Federal Funds Target Rate/i,"聯準會利率決議"],[/FOMC Statement/i,"FOMC 政策聲明"],[/FOMC Press Conference/i,"聯準會主席記者會"],[/CPI m\/m/i,"美國 CPI 月增率"],[/Core CPI m\/m/i,"美國核心 CPI 月增率"],[/CPI y\/y/i,"美國 CPI 年增率"],[/Core PCE Price Index/i,"美國核心 PCE 物價指數"],[/Non-Farm Employment Change/i,"美國非農就業"],[/Unemployment Rate/i,"失業率"],[/GDP q\/q/i,"GDP 季增率"],[/PPI m\/m/i,"美國 PPI 月增率"],[/ISM Manufacturing PMI/i,"ISM 製造業 PMI"],[/Retail Sales m\/m/i,"美國零售銷售"],[/JOLTS Job Openings/i,"JOLTS 職缺"],[/Consumer Confidence/i,"消費者信心指數"],[/BOJ Policy Rate/i,"日本央行政策利率"],[/Monetary Policy Statement/i,"日本央行政策聲明"],[/BOJ Outlook Report/i,"日本央行經濟展望報告"],[/BOJ Press Conference/i,"日本央行記者會"],[/Flash Manufacturing PMI/i,"製造業採購經理人指數初值"],[/Flash Services PMI/i,"服務業採購經理人指數初值"],[/GDP q.q/i,"GDP 季增率"],[/Core PCE Price Index m.m/i,"美國核心 PCE 月增率"]];return terms.find(([re])=>re.test(title))?.[1]??title;}

const previousTrackedCompanies=new Set(["2330","2454","2317","2382","3231","6669","2308","3711","3037","3035","6213","2344","2408","8299","4966","3081","3105","3718","5469","3017","3324","3013","2376","2377","2356","2357","2301","2368","6274","3533","3661","3443","6446","6488","5269","2379","3044","4938","2327","6285","1519","1513","2383","2449","3034","3008","3016","8996","2371","6667","3596","3653"]);
// Each AI supply-chain segment tracks only its three representative leaders.
// Rank is editorial coverage priority, not a real-time market-cap ranking.
const industryLeaders:Record<string,string[]>={
 "晶圓代工與IC設計":["2330","2454","2303"],
 "AI伺服器與組裝":["2317","2382","3231"],
 "電源與散熱":["2308","3017","3324"],
 "先進封裝與載板":["3711","3037","3189"],
 "PCB與高速材料":["2383","6213","2368"],
 "記憶體與儲存":["2408","2344","8299"],
 "網通與光通訊":["2345","6285","4979"]
};
const leaderIds=new Set(Object.values(industryLeaders).flat());
function textOnly(v:string){return v.replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
async function companyEvents(monday:string,friday:string):Promise<Event[]>{
 const response=await fetch("https://signova.tw/conference",{next:{revalidate:3600},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0","Accept":"text/html"}});
 if(!response.ok)throw Error("法說會來源 "+response.status);
 const html=await response.text();const events:Event[]=[];
 const year=Number(monday.slice(0,4));const seen=new Set<string>();
 for(const match of Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))){
  const cells=Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map(x=>textOnly(x[1]));
  if(cells.length<3)continue;
  const dateMatch=cells[0].match(/(\d{1,2})\/(\d{1,2})/);
  const companyMatch=cells[2].match(/(\d{4})\s*(.+)/);
  if(!dateMatch||!companyMatch||!leaderIds.has(companyMatch[1]))continue;
  const date=year+"-"+dateMatch[1].padStart(2,"0")+"-"+dateMatch[2].padStart(2,"0");
  if(date<monday||date>friday)continue;
  const time=cells[1].match(/\d{1,2}:\d{2}/)?.[0]??"時間待確認";
  const title=companyMatch[2]+" 法說會";
  const key=date+companyMatch[1];if(seen.has(key))continue;seen.add(key);
  events.push({date,time,title,level:"high",region:"🇹🇼",detail:companyMatch[1],source:"公開資訊觀測站公告彙整（台股AI解盤）"});
 }
 return events;
}
export async function GET(){
 const {monday,friday}=weekBounds();
 try{
  const res=await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json",{next:{revalidate:3600},signal:AbortSignal.timeout(6500),headers:{"Accept":"application/json"}});
  if(!res.ok)throw Error("行事曆來源 HTTP "+res.status);
  const raw=await res.json() as {title?:string;country?:string;date?:string;impact?:string;forecast?:string;previous?:string}[];
  if(!Array.isArray(raw))throw Error("行事曆格式異常");
  const macroEvents:Event[]=raw.flatMap(x=>{
   if(!x.title||!x.date||!["USD","TWD","CNY","JPY"].includes(x.country??""))return [];
   const instant=new Date(x.date);if(!Number.isFinite(instant.getTime()))return [];
   const date=taiwanDay(instant.toISOString());if(date<monday||date>friday)return [];
   const impact=(x.impact??"").toLowerCase();
   if(!["high","medium"].includes(impact))return [];
   const translated=translate(x.title);if(!/[一-龥]/.test(translated))return [];
   const localized=x.country==="JPY"?translated.replace(/^美國/,"日本"):x.country==="CNY"?translated.replace(/^美國/,"中國"):translated;
   return [{date,time:taiwanTime(instant.toISOString()),title:localized,level:impact as "high"|"medium",region:x.country==="USD"?"🇺🇸":x.country==="TWD"?"🇹🇼":x.country==="JPY"?"🇯🇵":"🌏",detail:[x.forecast&&"預期 "+x.forecast,x.previous&&"前值 "+x.previous].filter(Boolean).join(" · "),source:"Forex Factory 經濟行事曆"}];
  });
  const company=await companyEvents(monday,friday).catch(()=>[] as Event[]);
  const events=[...macroEvents,...company].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  return NextResponse.json({status:"ok",monday,friday,events,notice:"僅顯示已取得來源的公告；台灣重點企業法說會依公開公告彙整；無法確認日期者不顯示。",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=1800"}});
 }catch(e){return NextResponse.json({status:"unavailable",monday,friday,events:[],error:e instanceof Error?e.message:"來源暫不可用"},{status:503});}
}
