import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MisRow = { c?: string; n?: string; d?: string; t?: string; tlong?: string; z?: string; y?: string; o?: string; h?: string; l?: string; v?: string; tv?: string; a?: string };
type MisResponse = { msgArray?: MisRow[] };

const number = (v?: string): number | null => {
  if (!v || !/^-?[0-9,]+(?:\.[0-9]+)?$/.test(v.trim())) return null;
  const n = Number(v.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateOf = (d?: string) => d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
const timeOf = (row: MisRow): string | null => {
  if (!dateOf(row.d) || !/^\d{2}:\d{2}:\d{2}$/.test(row.t ?? "")) return null;
  return `${dateOf(row.d)}T${row.t}+08:00`;
};

export async function GET(_request: Request, context: { params: { symbol: string } }) {
  const symbol = context.params.symbol;
  if (!/^\d{4,6}$/.test(symbol)) return NextResponse.json({ error: "股票代號格式錯誤" }, { status: 400 });
  try {
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw|otc_${symbol}.tw&json=1&delay=0`;
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", Referer: "https://mis.twse.com.tw/stock/" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("行情來源暫時無法連線");
    const payload = await response.json() as MisResponse;
    const row = payload.msgArray?.find(r => r.c === symbol && !!r.d);
    if (!row) return NextResponse.json({ error: "查無上市或上櫃股票報價" }, { status: 404 });
    const dataDate = dateOf(row.d);
    const quoteTime = timeOf(row);
    if (dataDate !== today()) return NextResponse.json({ status: "not_available_today", error: "目前沒有今天的成交報價（尚未開盤、休市或資料尚未更新）", dataDate }, { status: 409 });
    const last = number(row.z);
    const reference = number(row.y);
    const price = last ?? number(row.a?.split("_").find(x => number(x) !== null));
    const change = last !== null && reference !== null ? Math.round((last - reference) * 100) / 100 : null;
    const delaySeconds = quoteTime ? Math.max(0, Math.round((Date.now() - new Date(quoteTime).getTime()) / 1000)) : null;
    return NextResponse.json({
      status: "ok", symbol, name: row.n ?? null, market: payload.msgArray?.findIndex(r => r === row) === 1 ? "TPEX" : "TWSE", dataDate, quoteTime,
      delaySeconds, delayDescription: delaySeconds === null ? "無法確認延遲" : `距最後成交 ${delaySeconds} 秒（不代表供應商延遲）`,
      isRealtime: false, dataSource: "TWSE MIS（非正式公開 API，供測試）",
      quote: { open: number(row.o), high: number(row.h), low: number(row.l), close: price, last, reference, change, volume: number(row.v), tradeValue: null, transactions: null },
      lastUpdatedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "盤中報價暫時無法取得" }, { status: 502 });
  }
}
