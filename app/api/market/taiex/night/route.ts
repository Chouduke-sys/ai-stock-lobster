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

 // Yahoo 股市台指期近一（WTX&）作為公開行情備援；只回傳可驗證的報價與時間。
 try{
  const response=await fetch("https://tw.stock.yahoo.com/future/WTX%26",{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{"User-Agent":"Mozilla/5.0 (compatible; AIStockLobster/1.0)","Accept":"text/html"}});
  if(response.ok){
   const html=await response.text();
   const text=html.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi," ").replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\\s+/g," ");
   const rawPrice=text.match(/成交\\s*([\\d,]+(?:\\.\\d+)?)/);
   const rawDate=text.match(/(?:資料時間|更新)\\s*[:：|]?\\s*(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})\\s*(\\d{1,2}):(\\d{2})(?::(\\d{2}))?/);
   if(rawPrice&&rawDate){
    const price=Number(rawPrice[1].replace(/,/g,""));
    const timestamp=new Date(Date.UTC(Number(rawDate[1]),Number(rawDate[2])-1,Number(rawDate[3]),Number(rawDate[4])-8,Number(rawDate[5]),Number(rawDate[6]??0)));
    const age=Math.round((now.getTime()-timestamp.getTime())/1000);
    if(price>0&&Number.isFinite(age)&&age>=-60&&age<=1800){
     return NextResponse.json({status:"ok",name:"台指期近一（Yahoo 股市）",price,contract:"近一",quoteTime:timestamp.toISOString(),delaySeconds:Math.max(age,0),dataSource:"Yahoo 股市 WTX&（公開網頁，可能延遲）",isRealtime:age<=30},{headers:{"Cache-Control":"no-store"}});
    }
   }
  }
 }catch{}
 const feeds=[
  {name:"主要授權行情",url:process.env.TAIFEX_NIGHT_QUOTE_URL,key:process.env.TAIFEX_NIGHT_API_KEY},
  {name:"富途行情橋接",url:process.env.FUTU_NIGHT_QUOTE_URL,key:process.env.FUTU_NIGHT_API_KEY},
  {name:"備援授權行情",url:process.env.FALLBACK_NIGHT_QUOTE_URL,key:process.env.FALLBACK_NIGHT_API_KEY}
 ].filter(feed=>!!feed.url);
 if(!feeds.length)return NextResponse.json({status:"not_configured",error:"尚未設定台指期夜盤授權行情來源；可設定主要、富途 OpenD 橋接或備援行情 API",isRealtime:false},{status:503,headers:{"Cache-Control":"no-store"}});
 const errors:string[]=[];
 for(const feed of feeds){
  try{
   const url=new URL(feed.url!);
   if(url.protocol!=="https:")throw Error("HTTPS required");
   const headers:Record<string,string>={};
   if(feed.key)headers.Authorization="Bearer "+feed.key;
   const response=await fetch(url.toString(),{cache:"no-store",signal:AbortSignal.timeout(4500),headers});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json() as Quote;
   const price=typeof data.price==="number"?data.price:NaN;
   const timestamp=typeof data.quoteTime==="string"?new Date(data.quoteTime):new Date(NaN);
   const age=Math.round((now.getTime()-timestamp.getTime())/1000);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(age)||age< -30||age>120||data.symbol!=="TX"||typeof data.contract!=="string"||!/^\d{6}$/.test(data.contract))throw Error("報價無效或超過120秒");
   return NextResponse.json({status:"ok",name:"臺股期貨夜盤（TX）",price,contract:data.contract,quoteTime:timestamp.toISOString(),delaySeconds:Math.max(0,age),dataSource:typeof data.source==="string"?data.source:feed.name,isRealtime:age<=15},{headers:{"Cache-Control":"no-store"}});
  }catch(e){errors.push(feed.name+": "+(e instanceof Error?e.message:"連線失敗"));}
 }
 return NextResponse.json({status:"unavailable",error:"所有已設定夜盤行情來源暫不可用",providersTried:errors.map(x=>x.split(":")[0]),isRealtime:false},{status:502,headers:{"Cache-Control":"no-store"}});

}
