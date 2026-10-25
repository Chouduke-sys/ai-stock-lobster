import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type RecordDay={date:string;prediction:"bullish"|"bearish"|"neutral";predictionLabel:string;outcome:null|{changePct:number;actual:"bullish"|"bearish"|"neutral";correct:boolean;indexClose:number;verifiedAt:string;source:string}};
export async function GET(){
 try{
  const r=await fetch("https://raw.githubusercontent.com/Chouduke-sys/ai-stock-lobster/main/data/daily-review.json",{next:{revalidate:300},signal:AbortSignal.timeout(6000)});
  if(!r.ok)throw Error("archive unavailable");
  const raw=await r.json() as RecordDay[];
  if(!Array.isArray(raw))throw Error("archive malformed");
  const completed=raw.filter(x=>x.outcome&&typeof x.outcome.correct==="boolean").sort((a,b)=>b.date.localeCompare(a.date));
  const accuracy=(n:number)=>{const rows=completed.slice(0,n);return {evaluated:rows.length,correct:rows.filter(x=>x.outcome?.correct).length,rate:rows.length?Math.round(rows.filter(x=>x.outcome?.correct).length/rows.length*1000)/10:null};};
  return NextResponse.json({status:"ok",latest:raw.slice(-10).reverse(),metrics:{days30:accuracy(30),days90:accuracy(90)},method:"08:45 盤前方向快照與當日證交所正式收盤指數比較；漲跌幅超過 ±0.15% 判為多／空，其餘中性。僅統計已驗證日期，不回填歷史預測。",source:"GitHub versioned archive / TWSE FMTQIK"},{headers:{"Cache-Control":"public, s-maxage=300"}});
 }catch{return NextResponse.json({status:"unavailable",error:"歷史盤前快照尚未建立或無法讀取"},{status:503});}
}
