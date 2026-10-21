import { NextResponse } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type YahooChart={chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>;error?:unknown}};
const twDate=(date:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
const twTime=(date:Date)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
export async function GET(_request:Request,{params}:{params:{symbol:string}}){
 const symbol=params.symbol;
 if(!/^\d{4,6}$/.test(symbol))return NextResponse.json({error:"股票代號格式錯誤"},{status:400});
 const today=twDate(new Date());
 for(const suffix of [".TW",".TWO"]){
  try{
   const url="https://query1.finance.yahoo.com/v8/finance/chart/"+symbol+suffix+"?interval=1m&range=1d&includePrePost=false";
   const res=await fetch(url,{next:{revalidate:60},headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(4500)});
   if(!res.ok)continue;
   const body=await res.json() as YahooChart;
   const result=body.chart?.result?.[0],times=result?.timestamp??[],prices=result?.indicators?.quote?.[0]?.close??[];
   const points=times.flatMap((t,i)=>{
    const price=prices[i],date=new Date(t*1000),time=twTime(date);
    if(typeof price!=="number"||!Number.isFinite(price)||twDate(date)!==today||time<"09:00"||time>"13:30")return [];
    return [{time:today+" "+time,price,date:today}];
   });
   if(points.length)return NextResponse.json({status:"ok",symbol,points,source:"Yahoo Finance Chart（非官方、可能延遲）",date:today},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=120"}});
  }catch{}
 }
 return NextResponse.json({status:"unavailable",symbol,points:[],error:"分時歷史資料來源暫時無法提供；改用本機報價取樣"},{headers:{"Cache-Control":"public, s-maxage=30"}});
}
