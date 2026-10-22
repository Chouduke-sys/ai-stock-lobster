import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type ResponseData={chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[];volume?:(number|null)[]}>}}>}};
export async function GET(){
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const res=await fetch("https://"+host+"/v8/finance/chart/%5ETWII?interval=1m&range=2d",{next:{revalidate:60},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!res.ok)continue;
   const data=await res.json() as ResponseData;
   const result=data.chart?.result?.[0],times=result?.timestamp??[],quotes=result?.indicators?.quote?.[0];
   const points=times.flatMap((seconds,i)=>{const price=quotes?.close?.[i];if(typeof price!=="number"||!Number.isFinite(price)||price<=0)return [];const date=new Date(seconds*1000);const dateParts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);if(time<"09:00"||time>"13:30")return [];const volume=quotes?.volume?.[i];return [{time:dateParts+" "+time,session:dateParts,value:price,volume:typeof volume==="number"&&volume>=0?volume:null}];});
   if(points.length)return NextResponse.json({status:"ok",points,source:"Yahoo Finance ^TWII 1分鐘歷史行情（可能延遲）"},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=60"}});
  }catch{}
 }
 return NextResponse.json({status:"unavailable",points:[],error:"暫時無法取得指數分鐘歷史"},{status:503});
}
