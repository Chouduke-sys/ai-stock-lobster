import { NextResponse } from "next/server";

/**
 * API contract placeholder.
 * Implement official TWSE/TPEx adapters server-side, validate upstream schema,
 * normalize all figures to shares, persist snapshots, and return only verified data.
 * Never populate this endpoint with fabricated rankings.
 */
export async function GET() {
  return NextResponse.json({
    status: "not_configured",
    message: "Official TWSE/TPEx data adapters are not configured yet.",
    dataSource: null,
    tradeDate: null,
    lastUpdatedAt: null,
    items: []
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
