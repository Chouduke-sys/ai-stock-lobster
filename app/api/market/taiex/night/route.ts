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

 // Yahoo 台指期近一 WTX&：讀取公開 HTML 的「成交」及頁首「更新」時間。
 // 原站可能快取或阻擋伺服器請求；不把舊資料冒充即時行情。
 for(const pageUrl of ["https://tw.finance.yahoo.com/future/WTX%26","https://tw.stock.yahoo.com/quote/WTX%26","https://tw.stock.yahoo.com/future/WTX%26"]){
  try{
   const response=await fetch(pageUrl,{next:{revalidate:20},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36","Accept":"text/html,application/xhtml+xml","Accept-Language":"zh-TW,zh;q=0.9"}});
   if(!response.ok)continue;
   const html=await response.text();
   const clean=html.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi," ").replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/\\s+/g," ");
   if(!clean.includes("台指期近一"))continue;
   const header=clean.match(/(?:收盤|盤中|即時|更新)\\s*[|｜]?\\s*(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})\\s*(\\d{1,2}):(\\d{2})(?:\\s*更新)?/);
   const dated=header??clean.match(/(?:資料時間|更新時間)\\s*[:：]?\\s*(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})\\s*(\\d{1,2}):(\\d{2})/);
   const quoteArea=clean.split(/台指期近一(?:即時行情)?/).slice(1).join(" ");
   const match=quoteArea.match(/(?:^|\\s)成交\\s*([0-9,]+(?:\\.[0-9]+)?)/)??clean.match(/(?:^|\\s)成交\\s*([0-9,]+(?:\\.[0-9]+)?)/);
   if(!dated||!match)continue;
   const price=Number(match[1].replace(/,/g,""));
   const timestamp=new Date(Date.UTC(+dated[1],+dated[2]-1,+dated[3],+dated[4]-8,+dated[5]));
   const age=Math.round((now.getTime()-timestamp.getTime())/1000);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(age)||age< -90||age>3600)continue;
   return NextResponse.json({status:"ok",name:"台指期近一（Yahoo 股市）",price,contract:"近一",quoteTime:timestamp.toISOString(),delaySeconds:Math.max(age,0),dataSource:"Yahoo 股市 WTX&（公開網頁；非交易所授權即時源）",isRealtime:false},{headers:{"Cache-Control":"no-store"}});
  }catch{}
 }
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
