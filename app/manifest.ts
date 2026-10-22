import type { MetadataRoute } from "next";
import lobsterIcon from "../ai_stock_lobster_icon.png";
export default function manifest(): MetadataRoute.Manifest {
 return {
  name:"AI股市龍蝦｜台股與全球市場",
  short_name:"AI股市龍蝦",
  description:"台股加權指數、個股趨勢、VIX 市場情緒與全球行情。",
  start_url:"/",
  scope:"/",
  display:"standalone",
  background_color:"#080f1d",
  theme_color:"#080f1d",
  lang:"zh-TW",
  orientation:"portrait-primary",
  icons:[{src:lobsterIcon.src,sizes:"any",type:"image/png",purpose:"any"},{src:lobsterIcon.src,sizes:"any",type:"image/png",purpose:"any"}]
 };
}
