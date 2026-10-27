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
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const accuracy=(days:number)=>{const cutoff=new Date(Date.parse(today+"T00:00:00Z")-(days-1)*86400000).toISOString().slice(0,10);const rows=completed.filter(x=>x.date>=cutoff&&x.date<=today);const correct=rows.filter(x=>x.outcome?.correct).length;return {evaluated:rows.length,correct,rate:rows.length?Math.round(correct/rows.length*1000)/10:null,from:cutoff,to:today};};
  return NextResponse.json({status:"ok",latest:raw.slice(-10).reverse(),metrics:{days30:accuracy(30),days90:accuracy(90)},method:"08:30 盤前方向快照與當日證交所正式收盤指數比較；漲跌幅超過 ±0.15% 判為多／空，其餘中性。僅統計已驗證日期，不回填歷史預測。",source:"GitHub versioned archive / TWSE FMTQIK"},{headers:{"Cache-Control":"public, s-maxage=300"}});
 }catch{return NextResponse.json({status:"unavailable",error:"歷史盤前快照尚未建立或無法讀取"},{status:503});}
}
