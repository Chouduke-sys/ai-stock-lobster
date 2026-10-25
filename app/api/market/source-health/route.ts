import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Probe={name:string;source:string;status:"ok"|"degraded";items:number;latencyMs:number;detail:string};
const sources=[
 {name:"上市個股盤後行情",source:"TWSE STOCK_DAY_ALL",url:"https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",min:100},
 {name:"加權指數收盤",source:"TWSE FMTQIK",url:"https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",min:1},
 {name:"融資融券",source:"TWSE MI_MARGN",url:"https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN",min:1},
 {name:"期貨每日行情",source:"TAIFEX DailyMarketReportFut",url:"https://openapi.taifex.com.tw/v1/DailyMarketReportFut",min:1},
 {name:"選擇權 P/C",source:"TAIFEX PutCallRatio",url:"https://openapi.taifex.com.tw/v1/PutCallRatio",min:1}
];
export async function GET(){
 const results:Probe[]=await Promise.all(sources.map(async item=>{
  const started=Date.now();
  try{
   const response=await fetch(item.url,{next:{revalidate:300},signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("HTTP "+response.status);
   const json:unknown=await response.json();
   const count=Array.isArray(json)?json.length:json&&typeof json==="object"?Object.keys(json).length:0;
   if(count<item.min)throw Error("資料筆數異常");
   return {name:item.name,source:item.source,status:"ok" as const,items:count,latencyMs:Date.now()-started,detail:"來源回應成功；尚須個別驗證欄位、日期及單位"};
  }catch(e){return {name:item.name,source:item.source,status:"degraded" as const,items:0,latencyMs:Date.now()-started,detail:e instanceof Error?e.message:"來源回應異常"};}
 }));
 return NextResponse.json({status:results.every(x=>x.status==="ok")?"ok":"degraded",checkedAt:new Date().toISOString(),results,note:"僅檢查來源連通性與基本資料筆數；不代表全部前台欄位已正確解析或為即時行情。"},{headers:{"Cache-Control":"no-store"}});
}
