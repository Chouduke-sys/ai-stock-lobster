import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { label:string; values:string[] };
const decode=(s:string)=>s.replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
function parseTable(html:string, heading:string):Row[]{
  const headingAt=html.indexOf(heading);
  if(headingAt<0)return [];
  const section=html.slice(headingAt,headingAt+16000);
  const table=section.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if(!table)return [];
  return Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(m=>{
    const cells=Array.from(m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)).map(c=>decode(c[1]));
    return {label:cells[0]||"",values:cells.slice(1)};
  }).filter(r=>r.label&&r.values.length>0).slice(0,12);
}
function extractInstitutionalTotals(html:string){
 const section=html.split("台股大盤 法人累積進出")[1]?.split("台股大盤 相關文章")[0]??"";
 const rows=Array.from(section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
 for(const row of rows){
  const cells=Array.from(row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)).map(m=>decode(m[1]));
  if(cells.length<5||!/^20[0-9]{2}\/[0-9]{1,2}\/[0-9]{1,2}$/.test(cells[0]))continue;
  const numbers=cells.slice(1,5).map(v=>Number(v.replace(/,/g,"")));
  if(numbers.every(Number.isFinite))return {date:cells[0].replace(/\//g,"-"),foreignYi:numbers[0],trustYi:numbers[1],dealerYi:numbers[2],totalYi:numbers[3]};
 }
 return null;
}

// HiStock three.aspx publishes dated aggregate net buy/sell (NT$ 100 million).
// This is a published session snapshot, not a tick-by-tick intraday feed.
function parseThreeInstitutional(html:string){
 const heading=html.search(/近三十日上市三大法人買賣超/);
 if(heading<0)return null;
 const table=html.slice(heading,heading+12000).match(/<table\\b[^>]*>[\\s\\S]*?<\\/table>/i)?.[0];
 if(!table)return null;
 const rows=Array.from(table.matchAll(/<tr\\b[^>]*>([\\s\\S]*?)<\\/tr>/gi));
 for(const row of rows){
  const cells=Array.from(row[1].matchAll(/<(?:td|th)\\b[^>]*>([\\s\\S]*?)<\\/(?:td|th)>/gi)).map(m=>decode(m[1]));
  if(cells.length<7||!/^\\d{1,2}\\/\\d{1,2}$/.test(cells[0]))continue;
  const values=cells.slice(1,7).map(x=>Number(x.replace(/,/g,"")));
  if(!values.every(Number.isFinite))continue;
  const [month,day]=cells[0].split("/").map(Number);
  const now=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Taipei"}));
  let year=now.getFullYear();
  if(month>now.getMonth()+1)year--;
  const date=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  const [foreignYi,trustYi,dealerYi,dealerProprietaryYi,dealerHedgeYi,totalYi]=values;
  if(Math.abs(foreignYi+trustYi+dealerYi-totalYi)>1)return null;
  return {date,foreignYi,trustYi,dealerYi,dealerProprietaryYi,dealerHedgeYi,totalYi,unit:"億元",source:"HiStock 上市三大法人買賣超"};
 }
 return null;
}
export async function GET(){
 try{
  const response=await fetch("https://histock.tw/台股大盤",{cache:"no-store",signal:AbortSignal.timeout(9000),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!response.ok)throw new Error("HiStock HTTP "+response.status);
  const html=await response.text();
  const institutional=parseTable(html,"台股大盤 三大法人買賣超");
  const threeResponse=await fetch("https://histock.tw/stock/three.aspx",{next:{revalidate:60},signal:AbortSignal.timeout(9000),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"}}).catch(()=>null);
  const liveInstitutional=threeResponse?.ok?parseThreeInstitutional(await threeResponse.text()):null;
  const institutionalTotals=extractInstitutionalTotals(html);
  const margin=parseTable(html,"融資融券餘額");
  const futures=parseTable(html,"台股期貨未平倉量");
  if(!liveInstitutional&&!institutional.length&&!institutionalTotals&&!margin.length&&!futures.length)throw new Error("HiStock 表格未出現在伺服器回傳 HTML（可能由 JavaScript 載入）");
  return NextResponse.json({status:"ok",institutional,institutionalTotals,liveInstitutional,margin,futures,source:"HiStock 台股大盤",retrievedAt:new Date().toISOString(),note:"HiStock 已公布交易日的法人買賣超，每分鐘檢查更新；非逐筆盤中即時。來源未公布時不填估計值。"},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"資料無法讀取"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
