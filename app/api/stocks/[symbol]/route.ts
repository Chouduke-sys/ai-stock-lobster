import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: { symbol: string } }) {
  const symbol = context.params.symbol;
  if (!/^\d{4,6}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid stock symbol" }, { status: 400 });
  }
  return NextResponse.json({
    status: "not_configured",
    symbol,
    name: null,
    quote: null,
    dataSource: null,
    lastUpdatedAt: null
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
