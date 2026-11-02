import {NextResponse} from "next/server";
import {getQuote} from "../../../../lib/yahoo-quote";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Yahoo={chart?:{result?:{timestamp?:number[];indicators?:{quote?:{close?:(number|null)[]}[]}}[]}};
export async function GET(){
 const quotes=await Promise.all([getQuote("標普500期貨","ES=F"),getQuote("那斯達克100期貨","NQ=F")]);
 const quote=quotes.find(item=>item.value!==null);
 if(!quote)return NextResponse.json({status:"unavailable",error:"目前無法取得美股期貨報價",points:[]},{status:503,headers:{"Cache-Control":"no-store"}});
 let points:{time:string;value:number}[]=[];
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const res=await fetch("https://"+host+"/v8/finance/chart/"+encodeURIComponent(quote.symbol)+"?interval=5m&range=2d",
    {next:{revalidate:15},headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(4000)});
   if(!res.ok)continue;
   const data=await res.json() as Yahoo,result=data.chart?.result?.[0];
   points=(result?.timestamp??[]).flatMap((time,i)=>{
    const value=result?.indicators?.quote?.[0]?.close?.[i];
    return Number.isFinite(time)&&typeof value==="number"&&Number.isFinite(value)&&value>0?[{time:new Date(time*1000).toISOString(),value}]:[];
   }).slice(-320);
   if(points.length)break;
  }catch{}
 }
 return NextResponse.json({status:"ok",symbol:quote.symbol,name:quote.symbol==="ES=F"?"美股標普500期貨（ES）":"美股那斯達克100期貨（NQ）",
  price:quote.value,change:quote.referencePrice===null?null:quote.value!-quote.referencePrice,
  quoteTime:quote.time,referenceDate:quote.referenceDate,points,
  source:"Yahoo Finance 報價／5分鐘走勢（可能延遲）",isRealtime:false},
  {headers:{"Cache-Control":"public, s-maxage=5"}});
}
