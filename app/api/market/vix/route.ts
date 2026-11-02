import {NextResponse} from "next/server";
import {getQuote} from "../../../../lib/yahoo-quote";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 const quote=await getQuote("VIX","^VIX");
 if(quote.value===null||quote.value>200)return NextResponse.json({status:"unavailable",error:"VIX 資料來源目前無法取得；不使用推估值"},{status:503,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({status:"ok",value:quote.value,
 change:quote.referencePrice===null?null:quote.value-quote.referencePrice,quoteTime:quote.time,
 referenceDate:quote.referenceDate,source:quote.source,isRealtime:false},
 {headers:{"Cache-Control":"public, s-maxage=5"}});
}
