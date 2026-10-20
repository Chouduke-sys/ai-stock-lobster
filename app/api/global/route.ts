import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "not_configured",
    provider: null,
    lastUpdatedAt: null,
    markets: [],
    news: []
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
