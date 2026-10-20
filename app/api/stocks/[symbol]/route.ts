import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TwseStock = {
  Date?: string;
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
  if (!value || !/^-?[\d,]+(?:\.\d+)?$/.test(value.trim())) {
    return null;
  }
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function rocDateToIso(value?: string): string | null {
  if (!value || !/^\d{7}$/.test(value)) return null;
  const year = Number(value.slice(0, 3)) + 1911;
  return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

function taiwanToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

export async function GET(
  _request: Request,
  context: { params: { symbol: string } }
) {
  const symbol = context.params.symbol;

  if (!/^\d{4,6}$/.test(symbol)) {
    return NextResponse.json(
      { error: "請輸入 4 至 6 位數字的股票代號" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
      { next: { revalidate: 300 } }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "證交所行情服務暫時無法使用" },
        { status: 502 }
      );
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected TWSE response");
    }

    const stock = (data as TwseStock[]).find((row) => row.Code === symbol);
    if (!stock) {
      return NextResponse.json(
        { error: "查無此上市股票的日行情資料（不含上櫃股票）" },
        { status: 404 }
      );
    }

    const dataDate = rocDateToIso(stock.Date);
    if (dataDate !== taiwanToday()) {
      return NextResponse.json({
        status: "not_available_today",
        error: "證交所尚未提供今天的個股日行情（或資料未附交易日期），不顯示舊資料",
        symbol,
        dataDate,
        today: taiwanToday(),
        isRealtime: false
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      status: "ok",
      symbol,
      name: stock.Name ?? null,
      market: "TWSE",
      dataDate: rocDateToIso(stock.Date),
      quote: {
        open: toNumber(stock.OpeningPrice),
        high: toNumber(stock.HighestPrice),
        low: toNumber(stock.LowestPrice),
        close: toNumber(stock.ClosingPrice),
        change: toNumber(stock.Change),
        volume: toNumber(stock.TradeVolume),
        tradeValue: toNumber(stock.TradeValue),
        transactions: toNumber(stock.Transaction)
      },
      dataSource: "TWSE STOCK_DAY_ALL",
      lastUpdatedAt: new Date().toISOString(),
      isRealtime: false
    });
  } catch {
    return NextResponse.json(
      { error: "取得台股行情失敗，請稍後再試" },
      { status: 502 }
    );
  }
}
