import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type YahooChart={chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[];volume?:(number|null)[]}>}}>;error?:unknown}};
export async function GET(){
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const url="https://"+host+"/v8/finance/chart/"+encodeURIComponent("WTX&")+"?interval=1m&range=5d&includePrePost=true";
   const response=await fetch(url,{next:{revalidate:60},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!response.ok)continue;
   const json=await response.json() as YahooChart;
   const chart=json.chart?.result?.[0],times=chart?.timestamp??[],closes=chart?.indicators?.quote?.[0]?.close??[],volumes=chart?.indicators?.quote?.[0]?.volume??[];
   const points=times.flatMap((stamp,i)=>{
    const value=closes[i];if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return [];
    const dt=new Date(stamp*1000);
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
    const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(dt);
    if(time>="05:00"&&time<"15:00")return [];
    const session=time<"05:00"?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(dt.getTime()-86400000)):date;
    const volume=volumes[i];
    return [{time:date+" "+time,session,value,volume:typeof volume==="number"&&volume>=0?volume:null}];
   });
   if(points.length>1)return NextResponse.json({status:"ok",points,source:"Yahoo Finance WTX& 台指期 1 分鐘歷史行情（可能延遲）"},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=60"}});
  }catch{}
 }
 return NextResponse.json({status:"unavailable",points:[],error:"Yahoo 公開資料目前沒有可核對的台指期夜盤分鐘歷史；不使用其他商品代替"},{status:503});
}
