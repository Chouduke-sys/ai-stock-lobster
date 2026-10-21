import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI股市龍蝦｜台股法人與全球市場研究平台",
  description: "追蹤台股三大法人買賣超、個股 K 線與全球財經市場。行情資料接通前，頁面會清楚標示資料狀態。",
  icons: { icon: "/ai-stock-lobster-icon.png", shortcut: "/ai-stock-lobster-icon.png", apple: "/ai-stock-lobster-icon.png" },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
