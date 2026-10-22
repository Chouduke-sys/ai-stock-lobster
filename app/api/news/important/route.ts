import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Item={title:string;url:string;publishedAt:string|null;source:string;summary:string|null;imageUrl:null};
const queries=[
 "川普 Trump 關稅 股市 when:2d",
 "Powell FOMC Federal Reserve 利率 發言 when:2d",
 "台積電 輝達 黃仁勳 台灣 科技 when:2d",
 "金管會 台灣央行 新台幣 金融 政策 when:2d"
];
function decode(value:string):string{
 return value.replaceAll("<![CDATA[","").replaceAll("]]>","").replaceAll("&amp;","&").replaceAll("&quot;",'"').replaceAll("&#39;","'").replaceAll("&apos;","'").replaceAll("&lt;","<").replaceAll("&gt;",">").trim();
}
function extract(source:string,name:string):string{
 const begin=source.indexOf("<"+name);
 if(begin<0)return "";
 const start=source.indexOf(">",begin);
 if(start<0)return "";
 const end=source.indexOf("</"+name+">",start+1);
 if(end<0)return "";
 return decode(source.slice(start+1,end));
}
function itemsFromXml(xml:string):Item[]{
 const items:Item[]=[];
 let offset=0;
 while(items.length<12){
  const start=xml.indexOf("<item>",offset);
  if(start<0)break;
  const end=xml.indexOf("</item>",start+6);
  if(end<0)break;
  offset=end+7;
  const item=xml.slice(start+6,end);
  const title=extract(item,"title");
  const url=extract(item,"link");
  const published=extract(item,"pubDate");
  const source=extract(item,"source");
  if(!title||!url.startsWith("https://"))continue;
  const date=new Date(published);
  items.push({title,url,publishedAt:Number.isFinite(date.getTime())?date.toISOString():null,source:source||"Google 新聞 RSS",summary:null,imageUrl:null});
 }
 return items;
}
export async function GET(){
 const batches=await Promise.all(queries.map(async query=>{
  try{
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:180},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!response.ok)return [] as Item[];
   return itemsFromXml(await response.text());
  }catch{return [] as Item[];}
 }));
 const seen=new Set<string>();
 const news=batches.flat().filter(item=>{const key=item.title.trim();if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Date.parse(b.publishedAt??"1970")-Date.parse(a.publishedAt??"1970")).slice(0,30);
 return NextResponse.json({status:news.length?"ok":"unavailable",news,source:"Google 新聞 RSS（多家媒體轉載，非官方發言逐字稿）",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=180, stale-while-revalidate=180"}});
}
