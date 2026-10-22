import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Yahoo={chart?:{result?:Array<{meta?:{regularMarketPrice?:number;previousClose?:number;chartPreviousClose?:number;regularMarketTime?:number;symbol?:string};timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>}};
export async function GET(){
 for(const symbol of ["ES=F","NQ=F"]){
  for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
   try{
    const url="https://"+host+"/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=5m&range=2d";
    const res=await fetch(url,{next:{revalidate:60},headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(5500)});
    if(!res.ok)continue;
    const data=await res.json() as Yahoo,result=data.chart?.result?.[0],meta=result?.meta;
    const times=result?.timestamp??[],closes=result?.indicators?.quote?.[0]?.close??[];
    const points=times.flatMap((seconds,i)=>{const value=closes[i];if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return [];return [{time:new Date(seconds*1000).toISOString(),value}];});
    const latest=points[points.length-1];
    const price=latest?.value??meta?.regularMarketPrice;
    if(typeof price!=="number"||!Number.isFinite(price)||price<=0)continue;
    const quoteTime=latest?.time??(typeof meta?.regularMarketTime==="number"?new Date(meta.regularMarketTime*1000).toISOString():null);
    const prev=meta?.previousClose??meta?.chartPreviousClose;
    return NextResponse.json({status:"ok",symbol,name:symbol==="ES=F"?"美股標普500期貨（ES）":"美股那斯達克100期貨（NQ）",price,change:typeof prev==="number"?Number((price-prev).toFixed(2)):null,quoteTime,points:points.slice(-320),source:"Yahoo Finance 5分鐘期貨行情（可能延遲）",isRealtime:false},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=60"}});
   }catch{}
  }
 }
 return NextResponse.json({status:"unavailable",error:"目前無法取得美股期貨報價",points:[]},{status:503,headers:{"Cache-Control":"no-store"}});
}
