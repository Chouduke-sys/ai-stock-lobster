import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;
type Article = { title:string; url:string; source:string; publishedAt:string|null };
function decodeXml(s:string):string {
 return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=String(n).toLowerCase().startsWith("x")?parseInt(String(n).slice(1),16):parseInt(n,10);return Number.isFinite(v)?String.fromCodePoint(v):"";}).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}
function field(xml:string,tag:string):string {return decodeXml(xml.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+tag+">","i"))?.[1]??"").trim();}
export async function GET(request:NextRequest){
 const symbol=request.nextUrl.searchParams.get("symbol")??"";
 const name=(request.nextUrl.searchParams.get("name")??"").trim().slice(0,50);
 if(!/^\d{4,6}$/.test(symbol))return NextResponse.json({status:"error",error:"股票代號格式不正確"},{status:400});
 const terms=[symbol+" 股票",...(name&&name!==symbol?[name+" 股票"]:[])];
 const articles:Article[]=[];const seen=new Set<string>();
 await Promise.all(terms.map(async term=>{
  try{
   const query=encodeURIComponent(term+" when:7d");
   const url="https://news.google.com/rss/search?q="+query+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:300},signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0 (compatible; AIStockLobster/1.0)"}});
   if(!response.ok)return;
   const xml=await response.text();
   for(const item of xml.match(/<item>[\s\S]*?<\/item>/gi)??[]){
    const title=field(item,"title"),link=field(item,"link"),source=field(item,"source"),rawDate=field(item,"pubDate");
    if(!title||!/^https:\/\//.test(link)||seen.has(title))continue;
    seen.add(title);const date=Date.parse(rawDate);
    articles.push({title,url:link,source:source||"Google 新聞",publishedAt:Number.isFinite(date)?new Date(date).toISOString():null});
   }
  }catch{}
 }));
 articles.sort((a,b)=>(b.publishedAt??"").localeCompare(a.publishedAt??""));
 return NextResponse.json({status:"ok",symbol,news:articles.slice(0,30),source:"Google 新聞 RSS",updatedAt:new Date().toISOString(),note:"新聞索引可能延遲或遺漏，非網路所有文章。"});
}
