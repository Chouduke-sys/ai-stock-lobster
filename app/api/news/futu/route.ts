import { NextResponse } from "next/server";
export const runtime="nodejs";
type News={title:string;url:string;publishedAt:string|null;source:string;imageUrl:string|null;summary:string|null};
function plainText(value:string):string{
 const entities:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",hellip:"…",mdash:"—",ndash:"–",bull:"•",ldquo:"“",rdquo:"”",lsquo:"‘",rsquo:"’"};
 let result=value;
 for(let i=0;i<3;i++){
  const next=result.replace(/<[^>]*>/g,"").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(_all,entity:string)=>{
   if(entity[0]==="#"){
    const hex=entity[1]?.toLowerCase()==="x";
    const n=parseInt(entity.slice(hex?2:1),hex?16:10);
    return Number.isInteger(n)&&n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff)?String.fromCodePoint(n):"";
   }
   return entities[entity.toLowerCase()]??_all;
  });
  if(next===result)break;
  result=next;
 }
 return result.replace(/\s+/g," ").trim();
}
function pick(o:Record<string,unknown>,keys:string[]):unknown{for(const k of keys)if(o[k]!==undefined&&o[k]!==null)return o[k];return null;}
function parseTime(value:unknown):string|null{
 if(typeof value==="number"){const d=new Date(value<1e12?value*1000:value);return Number.isFinite(d.getTime())?d.toISOString():null;}
 if(typeof value==="string"){
  if(/^\d{10,13}$/.test(value))return parseTime(Number(value));
  const d=new Date(value.replace(" ","T")+"+08:00");
  if(Number.isFinite(d.getTime()))return d.toISOString();
  const direct=new Date(value);return Number.isFinite(direct.getTime())?direct.toISOString():null;
 }
 return null;
}
function parseNews(raw:unknown):News[]{
 const root=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
 if(root.code!==undefined&&root.code!==0)return [];
 const data=root.data;
 const nested=data&&typeof data==="object"&&!Array.isArray(data)?data as Record<string,unknown>:{};
 const list=[data,root.list,root.news,root.items,root.results,nested.list,nested.news,nested.items,nested.results,nested.records].find(Array.isArray);
 if(!Array.isArray(list))return [];
 return list.flatMap((item:unknown)=>{
  if(!item||typeof item!=="object")return [];
  const r=item as Record<string,unknown>;
  const title=pick(r,["title","news_title","newsTitle","headline"]);
  const link=pick(r,["url","link","news_url","newsUrl","web_url","webUrl"]);
  if(typeof title!=="string"||!title.trim()||typeof link!=="string")return [];
  let url:URL;try{url=new URL(link);}catch{return [];}
  if(url.protocol!=="https:"&&url.protocol!=="http:")return [];
  const img=pick(r,["img_url","image_url","imageUrl","cover_url","coverUrl","thumbnail_url","thumbnailUrl","image","cover","thumbnail","pic_url","picUrl"]);
  const imgValue=typeof img==="string"?img:img&&typeof img==="object"?pick(img as Record<string,unknown>,["url","src"]):null;
  let imageUrl:string|null=null;
  if(typeof imgValue==="string"){try{const u=new URL(imgValue,url);if(u.protocol==="https:")imageUrl=u.href;}catch{}}
  const source=pick(r,["source","publisher","author","media"]);
  const excerpt=pick(r,["summary","description","abstract","news_summary","newsSummary","brief","intro","digest"]);
  const summary=typeof excerpt==="string" ? plainText(excerpt).slice(0,120) || null : null;
  return [{title:plainText(title),url:url.href,publishedAt:parseTime(pick(r,["publish_time","publishTime","published_at","publishedAt","time","date","created_at"])),source:typeof source==="string"?source:"富途牛牛",imageUrl,summary}];
 });
}
function newsKey(title:string):string{
 return title.toLowerCase().replace(/\s*[-–—|｜]\s*(富途牛牛|futunn|moomoo|鉅亨網|工商時報|經濟日報|聯合新聞網|中央社).*$/i,"").replace(new RegExp(String.raw`[\s\p{P}\p{S}]`,"gu"),"").slice(0,90);
}
function isReadableChinese(n:News):boolean{
 const chinese=(n.title.match(/[\u3400-\u9fff]/g)||[]).length;
 const latin=(n.title.match(/[a-z]/gi)||[]).length;
 if(chinese<4||latin>chinese*3)return false;
 if(/(?:login|signin|sign-in|register|subscribe|premium|paywall)/i.test(n.url))return false;
 return true;
}
export async function GET(){
 try{
  const endpoint=process.env.FUTU_NEWS_API_URL||"https://ai-news-search.futunn.com/news_search";
  const base=new URL(endpoint);
  if(base.protocol!=="https:"||base.hostname!=="ai-news-search.futunn.com")throw Error("Invalid Futu news endpoint");
  const keywords=["美股","聯準會","AI","全球經濟","川普","鮑爾","美聯儲","台積電","台灣金融"];
  const batches=await Promise.all(keywords.map(async keyword=>{
   try{
    const url=new URL(base);
    url.searchParams.set("keyword",keyword);
    url.searchParams.set("size","15");
    url.searchParams.set("news_type","1");
    url.searchParams.set("lang","zh-HK");
    url.searchParams.set("sort_type","2");
    const response=await fetch(url.toString(),{next:{revalidate:300},signal:AbortSignal.timeout(8500),headers:{"Accept":"application/json","User-Agent":"futunn-news-search/0.0.2 (Skill)"}});
    if(!response.ok)return [];
    return parseNews(await response.json());
   }catch{return [];}
  }));
  const seen=new Set<string>();
  const news=batches.flat().filter(isReadableChinese).filter(n=>{const key=newsKey(n.title);if(seen.has(n.url)||seen.has(key))return false;seen.add(n.url);seen.add(key);return true;})
   .sort((a,b)=>(b.publishedAt?Date.parse(b.publishedAt):0)-(a.publishedAt?Date.parse(a.publishedAt):0)).slice(0,45);
  if(!news.length)throw Error("No verified Futu news");
  const important=/川普|特朗普|Trump|鮑爾|Powell|聯準會|美聯儲|Fed\b|FOMC|央行總裁|總統發言|財政部長|黃仁勳|Jensen Huang|台積電|金管會|中央銀行|台灣央行|台灣科技|台灣金融|關稅|利率決策/i;
  const importantNews=news.filter(n=>important.test(n.title+" "+(n.summary??""))).slice(0,20);
  return NextResponse.json({status:"ok",news,importantNews,source:"富途牛牛新聞搜尋",fetchedAt:new Date().toISOString(),refreshSeconds:300});
 }catch{
  return NextResponse.json({status:"unavailable",error:"富途新聞來源目前沒有可用資料，請點擊富途新聞入口查看最新消息。",news:[],sourceUrl:"https://news.futunn.com/main"},{status:503});
 }
}
