import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IndexRow = {
  Date?: string;
  TAIEX?: string;
  Change?: string;
  TradeVolume?: string;
  TradeValue?: string;
  Transaction?: string;
};

function parseNumber(value?: string): number | null {
  if (!value || !/^-?[\\d,]+(?:\\.\\d+)?$/.test(value.trim())) return null;
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function parseDate(value?: string): string | null {
  if (!value || !/^\\d{7}$/.test(value)) return null;
  return `${Number(value.slice(0, 3)) + 1911}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

export async function GET() {
  try {
    const response = await fetch(
      "https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",
      { next: { revalidate: 300 } }
    );
    if (!response.ok) throw new Error("TWSE request failed");
    const result: unknown = await response.json();
    if (!Array.isArray(result)) throw new Error("Unexpected TWSE response");

    const rows = (result as IndexRow[])
      .filter((row) => parseNumber(row.TAIEX) !== null && parseDate(row.Date) !== null)
      .sort((a, b) => (a.Date ?? "").localeCompare(b.Date ?? ""));
    const latest = rows[rows.length - 1];
    if (!latest) {
      return NextResponse.json({ error: "目前無加權指數資料" }, { status: 503 });
    }
    const value = parseNumber(latest.TAIEX);
    const change = parseNumber(latest.Change);
    const previous = value !== null && change !== null ? value - change : null;
    const changePercent = previous && previous !== 0 && change !== null
      ? Math.round(change / previous * 10000) / 100
      : null;
    return NextResponse.json({
      status: "ok",
      name: "臺灣加權股價指數",
      date: parseDate(latest.Date),
      value,
      change,
      changePercent,
      tradeVolume: parseNumber(latest.TradeVolume),
      tradeValue: parseNumber(latest.TradeValue),
      transactions: parseNumber(latest.Transaction),
      dataSource: "TWSE FMTQIK",
      isRealtime: false,
      fetchedAt: new Date().toISOString(),
      recent: rows.slice(-20).map((row) => ({
        date: parseDate(row.Date),
        value: parseNumber(row.TAIEX)
      }))
    });
  } catch {
    return NextResponse.json({ error: "加權指數資料暫時無法取得" }, { status: 502 });
  }
}
