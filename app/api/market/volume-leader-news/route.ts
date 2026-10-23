import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Item={symbol:string;name:string;title:string;url:string;publishedAt:string|null;source:string};
const clean=(s:string)=>s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const stocks=(params.get("stocks")??"").split(",").slice(0,10).map(entry=>{const [symbol,name]=entry.split(":");return {symbol:(symbol??"").trim(),name:(name??"").trim()};}).filter(x=>/^\d{4,6}$/.test(x.symbol)&&x.name.length>0&&x.name.length<=24);
 if(!stocks.length)return NextResponse.json({status:"ok",items:[],asOf:new Date().toISOString()});
 const items=await Promise.all(stocks.map(async stock=>{
  try{
   const query='"'+stock.name+'" 股票 when:7d';
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:600},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!response.ok)return null;
   const xml=await response.text();
   const first=xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
   if(!first)return null;
   const tag=(key:string)=>clean(first.match(new RegExp("<"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+key+">","i"))?.[1]??"");
   const title=tag("title"),link=tag("link"),pubDate=tag("pubDate"),source=tag("source");
   if(!title||!/^https:\/\/news\.google\.com\//.test(link))return null;
   return {symbol:stock.symbol,name:stock.name,title,url:link,publishedAt:pubDate&&Number.isFinite(Date.parse(pubDate))?new Date(pubDate).toISOString():null,source:source||"Google 新聞"} as Item;
  }catch{return null;}
 }));
 return NextResponse.json({status:"ok",items:items.filter((x):x is Item=>x!==null),asOf:new Date().toISOString(),note:"各公司最近七天新聞搜尋結果；標題可能有同名企業，請點閱原文核實。"},{headers:{"Cache-Control":"public, s-maxage=600, stale-while-revalidate=300"}});
}
