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
export async function GET(){
 try{
  const response=await fetch("https://histock.tw/台股大盤",{cache:"no-store",signal:AbortSignal.timeout(9000),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW,zh;q=0.9"}});
  if(!response.ok)throw new Error("HiStock HTTP "+response.status);
  const html=await response.text();
  const institutional=parseTable(html,"台股大盤 三大法人買賣超");
  const margin=parseTable(html,"融資融券餘額");
  const futures=parseTable(html,"台股期貨未平倉量");
  if(!institutional.length&&!margin.length&&!futures.length)throw new Error("HiStock 表格未出現在伺服器回傳 HTML（可能由 JavaScript 載入）");
  return NextResponse.json({status:"ok",institutional,margin,futures,source:"HiStock 台股大盤",retrievedAt:new Date().toISOString(),note:"以來源頁面實際可取得的表格為準，未提供時不填入估計值。"},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"資料無法讀取"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
