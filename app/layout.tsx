import lobsterIcon from "../ai_stock_lobster_icon.png";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI股市龍蝦｜台股法人與全球市場研究平台",
  description: "追蹤台股三大法人買賣超、個股 K 線與全球財經市場。行情資料接通前，頁面會清楚標示資料狀態。",
  applicationName: "AI股市龍蝦",
  appleWebApp: { capable: true, title: "AI股市龍蝦", statusBarStyle: "black-translucent" },
  manifest: "/manifest.webmanifest",
  icons: { icon: lobsterIcon.src, shortcut: lobsterIcon.src, apple: lobsterIcon.src },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = { themeColor: "#080f1d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
