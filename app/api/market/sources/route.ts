import {NextResponse} from "next/server";
import {MARKET_SOURCES,providerObservations} from "../../../../lib/provider-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 return NextResponse.json({status:"ok",policy:"public-first / dated-normalized-data-only",
 sources:MARKET_SOURCES.map(source=>({...source,requiresTokenFor:source.id==="finmind"?["market-wide institutional stock rows"]:[]})),
 configured:{finmindToken:Boolean(process.env.FINMIND_API_TOKEN),finmindMarketWide:process.env.FINMIND_MARKET_WIDE==="1"},
 observations:providerObservations(),note:"觀測只代表目前執行個體近期請求；未設定金鑰不會宣稱受限資料集已啟用。新增來源須提供對應欄位、日期、單位與公開使用範圍。"},
 {headers:{"Cache-Control":"no-store"}});
}
