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
export async function GET() {
  try {
    const response = await fetch("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0", {
      cache: "no-store", headers: { Accept: "application/json", Referer: "https://mis.twse.com.tw/stock/" }, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("Source unavailable");
    const result = await response.json() as MisResponse;
    const row = result.msgArray?.find(r => r.c === "t00");
    if (!row) return NextResponse.json({ error: "加權指數盤中資料尚未提供" }, { status: 503 });
    const date = row.d && /^\d{8}$/.test(row.d) ? `${row.d.slice(0,4)}-${row.d.slice(4,6)}-${row.d.slice(6,8)}` : null;
    if (date !== today()) return NextResponse.json({ status: "not_available_today", error: "尚無今天的加權指數盤中資料（或今日休市）", dataDate: date }, { status: 409 });
    const value = num(row.z), reference = num(row.y);
    if (value === null) return NextResponse.json({ error: "加權指數尚未有今日成交值" }, { status: 503 });
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
    return NextResponse.json({ error: "加權指數盤中資料連線失敗" }, { status: 502 });
  }
}
