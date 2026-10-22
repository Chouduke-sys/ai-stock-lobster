import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Item={title:string;url:string;publishedAt:string|null;source:string;summary:string|null;imageUrl:null};
const queries=[
 "川普 OR Trump 關稅 股市 when:2d",
 "Powell OR FOMC OR Federal Reserve 利率 發言 when:2d",
 "台積電 OR 輝達 OR 黃仁勳 台灣 科技 when:2d",
 "金管會 OR 台灣央行 OR 新台幣 OR 金融 政策 when:2d"
];
const decode=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const tag=(s:string,n:string)=>decode(s.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+n+">","i"))?.[1]??"");
export async function GET(){
 const batches=await Promise.all(queries.map(async query=>{
  try{
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const res=await fetch(url,{next:{revalidate:180},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!res.ok)return [] as Item[];
   const xml=await res.text();
   const items:Item[]=[];
   const matches=Array.from(xml.matchAll(/<item>([\\s\\S]*?)<\\/item>/g)).slice(0,12);
   for(const match of matches){
    const title=tag(match[1],"title"),link=tag(match[1],"link"),pub=tag(match[1],"pubDate"),source=tag(match[1],"source");
    if(!title||!/^https:\\/\\//.test(link))continue;
    const date=new Date(pub);
    items.push({title,url:link,publishedAt:Number.isFinite(date.getTime())?date.toISOString():null,source:source||"Google 新聞 RSS",summary:null,imageUrl:null});
   }
   return items;;
  }catch{return [] as Item[];}
 }));
 const seen=new Set<string>();
 const news=batches.flat().filter(n=>{const key=n.title.replace(/\s+/g,"");if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Date.parse(b.publishedAt??"1970")-Date.parse(a.publishedAt??"1970")).slice(0,30);
 return NextResponse.json({status:news.length?"ok":"unavailable",news,source:"Google 新聞 RSS（多家媒體轉載，非官方發言逐字稿）",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=180, stale-while-revalidate=180"}});
}
