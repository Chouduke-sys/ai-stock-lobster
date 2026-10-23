import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function numeric(value: string) { return Number(value.replace(/,/g, "")); }

async function fromHiStock() {
  const response = await fetch("https://histock.tw/index-tw/TWN", {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-TW,zh;q=0.9" }
  });
  if (!response.ok) throw new Error("HiStock HTTP " + response.status);
  const html = await response.text();
  const plain = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ");
  const start = plain.search(/富台期\s*\(TWN\)/);
  if (start < 0) throw new Error("HiStock 找不到富台期 TWN 區塊");
  const quote = plain.slice(start, start + 950);
  const priceMatch = quote.match(/股價\s*([\d,]+(?:\.\d+)?)/);
  const changeMatch = quote.match(/漲跌\s*([▲▼+\-]?\s*[\d,]+(?:\.\d+)?)/);
  const percentMatch = quote.match(/漲幅\s*([+\-]?\d+(?:\.\d+)?)\s*%/);
  const volumeMatch = quote.match(/成交量\s*([\d,]+)\s*口/);
  if (!priceMatch || !changeMatch || !percentMatch) throw new Error("HiStock 富台期報價格式無法解析");
  const price = numeric(priceMatch[1]);
  const changeRaw = changeMatch[1].replace(/\s/g, "");
  const change = numeric(changeRaw.replace(/[▲▼]/g, "")) * (changeRaw.includes("▼") || changeRaw.startsWith("-") ? -1 : 1);
  const changePercent = Number(percentMatch[1]);
  if (![price,change,changePercent].every(Number.isFinite) || price < 100 || price > 20000 || Math.abs(changePercent)>30 || Math.abs(changePercent-change/(price-change)*100)>0.35) throw new Error("HiStock 報價數值不一致");
  return { status:"ok", price, change, changePercent, quoteTime:null, delayMinutes:null, source:"HiStock 嗨投資 富台期 TWN", isRealtime:false, isStale:true, volume:volumeMatch?numeric(volumeMatch[1]):null, notice:"來源頁面未提供可驗證的完整報價時間，無法保證即時性；數值為 HiStock 頁面報價。" };
}

export async function GET() {
  try {
    return NextResponse.json(await fromHiStock(),{headers});
  } catch(e) {
    return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"富台期報價暫無資料"},{status:503,headers});
  }
}
