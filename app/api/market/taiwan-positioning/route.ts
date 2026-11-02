import {finmindPublication} from "../../../../lib/finmind";
import {fetchHiStockThree} from "../../../../lib/histock-three";
import {taiwanCalendar} from "../../../../lib/trading-calendar";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const calendar=await taiwanCalendar();
  const [histock,fin]=await Promise.all([fetchHiStockThree(),finmindPublication("institutional",[calendar.date,...(calendar.referenceDate?[calendar.referenceDate]:[])])]);
  const institutional=[histock,fin&&"foreignYi" in fin?fin:null].filter((row):row is NonNullable<typeof histock>=>row!==null).sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
  if(!calendar.referenceDate||!institutional||institutional.date<calendar.referenceDate||institutional.date>calendar.date)
   return NextResponse.json({status:"unavailable",error:"法人資料日期未通過驗證，暫不顯示舊資料或未標日期的表格",dataDate:institutional?.date??null},{status:503,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({status:"ok",institutional:[],institutionalTotals:null,
   liveInstitutional:{...institutional,unit:"億元"},margin:[],futures:[],
   source:institutional.source,retrievedAt:new Date().toISOString(),
   note:"僅顯示具交易日期且通過加總驗證的法人資料；融資與期權使用各自的具單位 adapter，不轉載未標日期表格。"},
   {headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({status:"unavailable",error:"法人資料或交易日曆無法取得"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
