import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Yahoo={chart?:{result?:Array<{meta?:{regularMarketPrice?:number;previousClose?:number;chartPreviousClose?:number;regularMarketTime?:number;symbol?:string}}>}};
export async function GET(){
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const res=await fetch("https://"+host+"/v8/finance/chart/%5EVIX?interval=1d&range=5d",{next:{revalidate:300},headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(5500)});
   if(!res.ok)continue;
   const data=await res.json() as Yahoo;
   const meta=data.chart?.result?.[0]?.meta;
   const value=meta?.regularMarketPrice,previous=meta?.previousClose??meta?.chartPreviousClose;
   if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>200)continue;
   const quoteTime=typeof meta?.regularMarketTime==="number"?new Date(meta.regularMarketTime*1000).toISOString():null;
   return NextResponse.json({status:"ok",value,change:typeof previous==="number"?Number((value-previous).toFixed(2)):null,quoteTime,source:"Yahoo Finance · CBOE VIX（可能延遲）",isRealtime:false},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
  }catch{}
 }
 return NextResponse.json({status:"unavailable",error:"VIX 資料來源目前無法取得；不使用推估值"},{status:503,headers:{"Cache-Control":"no-store"}});
}
