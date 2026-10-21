import { NextResponse } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Quote={symbol?:unknown;price?:unknown;quoteTime?:unknown;source?:unknown;contract?:unknown};
function session(now:Date){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(now);
 const hour=Number(parts.find(p=>p.type==="hour")?.value),minute=Number(parts.find(p=>p.type==="minute")?.value);
 const day=parts.find(p=>p.type==="weekday")?.value;
 const t=hour*60+minute;
 return ((day==="Mon"||day==="Tue"||day==="Wed"||day==="Thu"||day==="Fri")&&t>=900)
  || ((day==="Tue"||day==="Wed"||day==="Thu"||day==="Fri"||day==="Sat")&&t<300);
}
export async function GET(){
 const now=new Date();
 if(!session(now))return NextResponse.json({status:"closed",error:"目前非台指期夜盤交易時段（週一至週五 15:00～次日 05:00，休市日除外）",isRealtime:false},{status:409,headers:{"Cache-Control":"no-store"}});
 const endpoint=process.env.TAIFEX_NIGHT_QUOTE_URL;
 if(!endpoint)return NextResponse.json({status:"not_configured",error:"尚未設定具授權的台指期夜盤即時行情來源；不顯示猜測價格",isRealtime:false},{status:503,headers:{"Cache-Control":"no-store"}});
 try{
  const url=new URL(endpoint);
  if(url.protocol!=="https:")throw Error("HTTPS required");
  const headers:Record<string,string>={};
  if(process.env.TAIFEX_NIGHT_API_KEY)headers.Authorization="Bearer "+process.env.TAIFEX_NIGHT_API_KEY;
  const response=await fetch(url.toString(),{cache:"no-store",signal:AbortSignal.timeout(7000),headers});
  if(!response.ok)throw Error("Feed unavailable");
  const data=await response.json() as Quote;
  const price=typeof data.price==="number"?data.price:NaN;
  const timestamp=typeof data.quoteTime==="string"?new Date(data.quoteTime):new Date(NaN);
  const age=Math.round((now.getTime()-timestamp.getTime())/1000);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(age)||age< -30||age>120 || data.symbol!=="TX" || typeof data.contract!=="string" || !/^\d{6}$/.test(data.contract))
    return NextResponse.json({status:"stale",error:"夜盤報價格式錯誤、契約不明或報價超過 120 秒；已停止顯示",isRealtime:false},{status:503,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({status:"ok",name:"臺股期貨夜盤（TX）",price,contract:data.contract,quoteTime:timestamp.toISOString(),delaySeconds:Math.max(0,age),dataSource:typeof data.source==="string"?data.source:"授權行情供應商",isRealtime:false},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({status:"unavailable",error:"夜盤行情供應商連線失敗，暫不顯示價格",isRealtime:false},{status:502,headers:{"Cache-Control":"no-store"}});}
}
