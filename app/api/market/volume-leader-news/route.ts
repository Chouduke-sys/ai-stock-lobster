import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";

type Stock={symbol:string;name:string};
type Item={symbol:string;name:string;title:string;url:string;publishedAt:string|null;source:string};
type FutuItem={title:string;url:string;publishedAt:string|null;source:string};
const MAX_NEWS_AGE_MS=72*60*60*1000;
const clean=(s:string)=>s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
function freshDate(value:string|null):boolean{
 if(!value)return false;
 const t=Date.parse(value);
 return Number.isFinite(t)&&t<=Date.now()+300000&&t>=Date.now()-MAX_NEWS_AGE_MS;
}
function isArticle(title:string):boolean{
 return !/今日股價與討論|股市爆料同學會|股價走勢|即時行情|股票報價|股票資訊|歷史股價|股價與討論/i.test(title);
}
function fromGoogle(xml:string,stock:Stock):Item|null{
 const candidates:Item[]=[];
 for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
  const item=match[1];
  const tag=(key:string)=>clean(item.match(new RegExp("<"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+key+">","i"))?.[1]??"");
  const title=tag("title"),link=tag("link"),pubDate=tag("pubDate"),source=tag("source");
  if(!title||!isArticle(title)||(!title.includes(stock.name)&&!title.includes(stock.symbol)))continue;
  if(!/^https:\/\/news\.google\.com\//.test(link)||!freshDate(pubDate))continue;
  candidates.push({symbol:stock.symbol,name:stock.name,title,url:link,publishedAt:new Date(pubDate).toISOString(),source:source||"Google 新聞"});
  if(candidates.length>=30)break;
 }
 candidates.sort((a,b)=>Date.parse(b.publishedAt??"")-Date.parse(a.publishedAt??""));
 return candidates[0]??null;
}
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const stocks=(params.get("stocks")??"").split(",").slice(0,10).map(entry=>{const [symbol,name]=entry.split(":");return {symbol:(symbol??"").trim(),name:(name??"").trim()};}).filter(x=>/^\d{4,6}$/.test(x.symbol)&&x.name.length>0&&x.name.length<=24);
 if(!stocks.length)return NextResponse.json({status:"ok",items:[],asOf:new Date().toISOString()});
 // Reuse the site's verified Futu news feed first, rather than accepting a stale Google search landing page.
 let futu: FutuItem[]=[];
 try{
  const endpoint=new URL("/api/news/futu",request.url);
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(7000),cache:"no-store"});
  if(response.ok){
   const body=await response.json();
   if(body?.status==="ok"&&Array.isArray(body.news)){
    futu=body.news.filter((x:unknown):x is FutuItem=>{
     if(!x||typeof x!=="object")return false;
     const n=x as Partial<FutuItem>;
     return typeof n.title==="string"&&typeof n.url==="string"&&typeof n.source==="string"&&freshDate(n.publishedAt??null)&&isArticle(n.title)&&/^https?:\/\//.test(n.url);
    });
   }
  }
 }catch{}
 const items=await Promise.all(stocks.map(async stock=>{
  const match=futu.find(n=>n.title.includes(stock.name)||n.title.includes(stock.symbol));
  if(match)return {symbol:stock.symbol,name:stock.name,title:match.title,url:match.url,publishedAt:match.publishedAt,source:match.source} as Item;
  try{
   const query='"'+stock.name+'" when:3d';
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:600},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!response.ok)return null;
   return fromGoogle(await response.text(),stock);
  }catch{return null;}
 }));
 return NextResponse.json({status:"ok",items:items.filter((x):x is Item=>x!==null),asOf:new Date().toISOString(),note:"只顯示最近72小時有發布日期的個股新聞；無符合條件的文章時不以舊行情頁面充數。"},{headers:{"Cache-Control":"public, s-maxage=600, stale-while-revalidate=300"}});
}
