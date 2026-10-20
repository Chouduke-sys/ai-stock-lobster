import { NextResponse } from "next/server";
import { aggregate, indicators, numberValue, rocDate, type Candle } from "../../../../lib/technical";
export const runtime = "nodejs";

type TwseMonth = { stat?: string; data?: unknown[][] };
function monthsBack(count: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find(p=>p.type==="year")?.value);
  const month = Number(parts.find(p=>p.type==="month")?.value);
  return Array.from({length:count}, (_,i)=>{
    const date = new Date(Date.UTC(year,month-1-i,1));
    return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}01`;
  });
}
export async function GET(request: Request, context: {params:{symbol:string}}) {
  const symbol=context.params.symbol;
  if (!/^\d{4}$/.test(symbol)) return NextResponse.json({error:"請輸入四碼上市股票代號"}, {status:400});
  const period = new URL(request.url).searchParams.get("period") ?? "day";
  if (!["day","week","month"].includes(period)) return NextResponse.json({error:"K 線週期錯誤"},{status:400});
  try {
    const months=monthsBack(12);
    const results=await Promise.all(months.map(async date=>{
      const url=`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${symbol}`;
      try {
        const response=await fetch(url,{next:{revalidate:3600},signal:AbortSignal.timeout(10000)});
        if(!response.ok) return [];
        const body=await response.json() as TwseMonth;
        if(body.stat!=="OK" || !Array.isArray(body.data)) return [];
        return body.data.flatMap((row):Candle[]=>{
          if(!Array.isArray(row)) return [];
          const date=rocDate(String(row[0]??""));
          const volume=numberValue(row[1]),open=numberValue(row[3]),high=numberValue(row[4]),low=numberValue(row[5]),close=numberValue(row[6]);
          return date && volume!==null && open!==null && high!==null && low!==null && close!==null ? [{date,volume,open,high,low,close}] : [];
        });
      } catch {return [];}
    }));
    const sorted=[...new Map(results.flat().map(row=>[row.date,row])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    if(!sorted.length) return NextResponse.json({error:"暫時無法取得上市股票歷史行情，或股票代號不存在"},{status:503});
    const candles=aggregate(sorted,period as "day"|"week"|"month");
    const metrics=indicators(candles);
    return NextResponse.json({
      status:"ok",symbol,period,dataSource:"TWSE STOCK_DAY（歷史日資料）",
      asOf:sorted[sorted.length-1].date, isRealtime:false,
      candles:candles.map((c,i)=>({...c,ma5:metrics.ma5[i],ma10:metrics.ma10[i],ma20:metrics.ma20[i],ma60:metrics.ma60[i],rsi14:metrics.rsi14[i],...metrics.macd[i]}))
    });
  } catch {return NextResponse.json({error:"歷史行情服務暫時無法使用"},{status:502});}
}
