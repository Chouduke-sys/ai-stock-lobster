import {parseTwseMargin} from "../../../../lib/twse-margin";
import {sourceQuality} from "../../../../lib/source-validation";
import {taiwanCalendar} from "../../../../lib/trading-calendar";
import {parseTaifexPositioning} from "../../../../lib/taifex-positioning";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Probe={name:string;source:string;status:"ok"|"degraded";items:number;latencyMs:number;detail:string};
const sources=[
 {name:"上市個股盤後行情",source:"TWSE STOCK_DAY_ALL",url:"https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",min:100,required:["ClosingPrice","TradeValue"]},
 {name:"加權指數收盤",source:"TWSE FMTQIK",url:"https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",min:1,required:["TAIEX","Change"]},
 {name:"融資融券",source:"TWSE MI_MARGN",url:"https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN",min:1,required:["MarginPurchaseTodayBalance"]},
 {name:"期貨每日行情",source:"TAIFEX DailyMarketReportFut",url:"https://openapi.taifex.com.tw/v1/DailyMarketReportFut",min:1,required:["Last"]},
 {name:"選擇權 P/C",source:"TAIFEX PutCallRatio",url:"https://openapi.taifex.com.tw/v1/PutCallRatio",min:1,required:["PutCallVolumeRatio%","PutCallOIRatio%"]}
];
export async function GET(){
 const calendar=await taiwanCalendar();
 const results:Probe[]=await Promise.all(sources.map(async item=>{
  const started=Date.now();
  try{
   const url=item.source==="TWSE MI_MARGN"&&calendar.referenceDate?"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date="+calendar.referenceDate.replace(/-/g,"")+"&selectType=MS&response=json":item.url;
   const response=await fetch(url,{next:{revalidate:300},signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("HTTP "+response.status);
   const json:unknown=await response.json();
   if(item.source==="TWSE MI_MARGN"){
    if(!calendar.referenceDate)throw Error("官方參考交易日無法確認");
    const parsed=parseTwseMargin(json,calendar.referenceDate);
    if(!parsed)throw Error("融資融券日期、欄位或單位無法驗證");
    return {name:item.name,source:item.source,status:"ok" as const,items:1,latencyMs:Date.now()-started,detail:"實際 adapter 已驗證日期與億元／張換算；資料日 "+parsed.date};
   }
   const count=Array.isArray(json)?json.length:json&&typeof json==="object"?Object.keys(json).length:0;
   if(count<item.min)throw Error("資料筆數異常");
   if(!calendar.referenceDate)throw Error("官方參考交易日無法確認");
   const quality=sourceQuality(json,item.required,item.min,calendar.referenceDate,calendar.date);
   if(!quality.ok)throw Error(quality.detail);
   if(item.source==="TAIFEX PutCallRatio"&&!parseTaifexPositioning(json as Record<string,unknown>[],[],quality.date!))throw Error("P/C 百分比與成交量／未平倉口數不一致");
   return {name:item.name,source:item.source,status:"ok" as const,items:count,latencyMs:Date.now()-started,detail:quality.detail+"；資料日 "+quality.date};
  }catch(e){return {name:item.name,source:item.source,status:"degraded" as const,items:0,latencyMs:Date.now()-started,detail:e instanceof Error?e.message:"來源回應異常"};}
 }));
 return NextResponse.json({status:results.every(x=>x.status==="ok")?"ok":"degraded",checkedAt:new Date().toISOString(),results,note:"檢查來源筆數、必要欄位與資料日期；P/C 另核對口數計算。未知欄位視為降級，不代表即時行情。"},{headers:{"Cache-Control":"no-store"}});
}
