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

export const runtime = "nodejs";

type TwseStock = {
  Code?: string;
  Name?: string;
  TradeVolume?: string;
  TradeValue?: string;
  OpeningPrice?: string;
  HighestPrice?: string;
  LowestPrice?: string;
  ClosingPrice?: string;
  Change?: string;
  Transaction?: string;
};

function toNumber(value?: string): number | null {
  if (!value || value.trim() === "" || value === "-") {
    return null;
  }

  const result = Number(value.replaceAll(",", ""));
  return Number.isFinite(result) ? result : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim();

  if (!/^\d{4,6}$/.test(code)) {
    return Response.json(
      { error: "請輸入有效的股票代號，例如 2330" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
      { next: { revalidate: 300 } }
    );

    if (!response.ok) {
      return Response.json(
        { error: "暫時無法取得證交所行情資料" },
        { status: 502 }
      );
    }

    const stocks: TwseStock[] = await response.json();
    const item = stocks.find((stock) => stock.Code === code);

    if (!item) {
      return Response.json(
        { error: "查無此上市股票，或資料尚未提供" },
        { status: 404 }
      );
    }

    return Response.json({
      source: "臺灣證券交易所 OpenAPI",
      market: "上市",
      fetchedAt: new Date().toISOString(),
      stock: {
        code: item.Code,
        name: item.Name,
        volume: toNumber(item.TradeVolume),
        tradeValue: toNumber(item.TradeValue),
        open: toNumber(item.OpeningPrice),
        high: toNumber(item.HighestPrice),
        low: toNumber(item.LowestPrice),
        close: toNumber(item.ClosingPrice),
        change: toNumber(item.Change),
        transactions: toNumber(item.Transaction),
      },
    });
  } catch {
    return Response.json(
      { error: "行情資料連線失敗，請稍後再試" },
      { status: 502 }
    );
  }
}
