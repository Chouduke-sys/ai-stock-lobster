import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MisIndex = { c?: string; d?: string; t?: string; z?: string; y?: string; o?: string; h?: string; l?: string; v?: string; n?: string };
type MisResponse = { msgArray?: MisIndex[] };
const num = (v?: string): number | null => {
  if (!v || !/^-?[0-9,]+(?:\.[0-9]+)?$/.test(v.trim())) return null;
  const n = Number(v.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type YahooChart={chart?:{result?:Array<{meta?:{chartPreviousClose?:number;previousClose?:number};timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>}};
async function yahooToday(){
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const response=await fetch("https://"+host+"/v8/finance/chart/%5ETWII?interval=1m&range=5d",{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!response.ok)continue;
   const body=await response.json() as YahooChart;
   const item=body.chart?.result?.[0],timestamps=item?.timestamp??[],closes=item?.indicators?.quote?.[0]?.close??[];
   for(let i=timestamps.length-1;i>=0;i--){
    const value=closes[i];if(typeof value!=="number"||!Number.isFinite(value)||value<=0)continue;
    const quoteTime=new Date(timestamps[i]*1000).toISOString();
    const local=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(quoteTime));
    if(local!==today())break;
    const previous=item?.meta?.chartPreviousClose??item?.meta?.previousClose;
    const change=typeof previous==="number"?Math.round((value-previous)*100)/100:null;
    return NextResponse.json({status:"ok",name:"臺灣加權股價指數",date:local,value,change,changePercent:change!==null&&previous?Math.round(change/previous*10000)/100:null,quoteTime,delaySeconds:Math.max(0,Math.round((Date.now()-timestamps[i]*1000)/1000)),delayDescription:"Yahoo Finance 分鐘歷史行情（可能延遲）",dataSource:"Yahoo Finance ^TWII（備援）",isRealtime:false,fetchedAt:new Date().toISOString(),recent:[]},{headers:{"Cache-Control":"no-store"}});
   }
  }catch{}
 }
 return null;
}
export async function GET() {
  try {
    const response = await fetch("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0", {
      cache: "no-store", headers: { Accept: "application/json", Referer: "https://mis.twse.com.tw/stock/" }, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {const fallback=await yahooToday();if(fallback)return fallback;throw new Error("Source unavailable");}
    const result = await response.json() as MisResponse;
    const row = result.msgArray?.find(r => r.c === "t00");
    if (!row) return await yahooToday()??NextResponse.json({ error: "加權指數盤中資料尚未提供" }, { status: 503 });
    const date = row.d && /^\d{8}$/.test(row.d) ? `${row.d.slice(0,4)}-${row.d.slice(4,6)}-${row.d.slice(6,8)}` : null;
    if (date !== today()) return await yahooToday()??NextResponse.json({ status: "not_available_today", error: "尚無今天的加權指數盤中資料（或今日休市）", dataDate: date }, { status: 409 });
    const value = num(row.z), reference = num(row.y);
    if (value === null) return await yahooToday()??NextResponse.json({ error: "加權指數尚未有今日成交值" }, { status: 503 });
    const change = reference === null ? null : Math.round((value - reference) * 100) / 100;
    const changePercent = reference && change !== null ? Math.round(change / reference * 10000) / 100 : null;
    const quoteTime = row.t && /^\d{2}:\d{2}:\d{2}$/.test(row.t) ? `${date}T${row.t}+08:00` : null;
    const delaySeconds = quoteTime ? Math.max(0, Math.round((Date.now() - new Date(quoteTime).getTime()) / 1000)) : null;
    return NextResponse.json({
      status: "ok", name: "臺灣加權股價指數", date, value, change, changePercent,
      quoteTime, delaySeconds, delayDescription: delaySeconds === null ? "無法確認延遲" : `距資料時間 ${delaySeconds} 秒（不代表供應商延遲）`,
      dataSource: "TWSE MIS（非正式公開 API，供測試）", isRealtime: false,
      fetchedAt: new Date().toISOString(), recent: []
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return await yahooToday()??NextResponse.json({ error: "加權指數盤中資料連線失敗" }, { status: 502 });
  }
}
