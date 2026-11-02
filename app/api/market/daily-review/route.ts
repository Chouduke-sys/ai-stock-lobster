import {reviewMetrics} from "../../../../lib/market-data";
import {validSnapshot} from "../../../../lib/morning-snapshot";
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
  const verified=raw.filter(validSnapshot);
  const accuracy=(count:number)=>reviewMetrics(verified,count);
  return NextResponse.json({status:"ok",latest:verified.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10),legacyExcluded:raw.length-verified.length,metrics:{days30:accuracy(30),days90:accuracy(90)},method:"08:30～08:59 內封存且雜湊驗證通過的盤前快照，與當日證交所正式收盤指數比較；30／90 指最近已驗證交易紀錄數；漲跌幅超過 ±0.15% 判為多／空，其餘中性。排除舊格式與逾時快照，不回填歷史預測。",source:"GitHub versioned archive / TWSE FMTQIK"},{headers:{"Cache-Control":"public, s-maxage=300"}});
 }catch{return NextResponse.json({status:"unavailable",error:"歷史盤前快照尚未建立或無法讀取"},{status:503});}
}
