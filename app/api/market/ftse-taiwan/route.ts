import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://www.wantgoo.com/global/stwn%26", {
      cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketDashboard/1.0)", "Accept-Language": "zh-TW,zh;q=0.9" }
    });
    if (!response.ok) throw new Error("玩股網 HTTP " + response.status);
    const html = await response.text();
    const plain = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ");
    // Match the named STWN& quote block, not unrelated index prices in the sidebar.
    const match = plain.match(/富台指\s+STWN&\s+(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+延遲報價\s*(\d+)\s*分鐘[\s\S]{0,100}?([\d,]+(?:\.\d+)?)\s+([+-]?[\d,]+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*%/);
    if (!match) throw new Error("無法驗證富台指報價格式");
    const price = Number(match[4].replaceAll(",", ""));
    const change = Number(match[5].replaceAll(",", ""));
    const changePercent = Number(match[6]);
    const quoteTime = new Date(match[1] + "T" + match[2] + ":00+08:00");
    const ageMinutes = (Date.now() - quoteTime.getTime()) / 60000;
    if (![price, change, changePercent, ageMinutes].every(Number.isFinite) || price <= 0 || ageMinutes < -20 || ageMinutes > 10080 || Math.abs(changePercent) > 30 || Math.abs(changePercent - change / (price - change) * 100) > 0.25) throw new Error("富台指報價資料不一致或已過期");
    return NextResponse.json({status:"ok",price,change,changePercent,quoteTime:quoteTime.toISOString(),delayMinutes:Number(match[3]),source:"玩股網 STWN&（延遲報價）",isRealtime:false,isStale:ageMinutes>60},{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"富台指報價暫無資料"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
