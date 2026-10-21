import { NextResponse } from "next/server";
export const runtime="nodejs";
type News={title:string;url:string;publishedAt:string|null;source:string;imageUrl:string|null};
function pick(o:Record<string,unknown>,keys:string[]):unknown{for(const k of keys){if(o[k]!==undefined&&o[k]!==null)return o[k];}return null;}
function normalized(raw:unknown):News[]{
 const root=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
 const data=root.data&&typeof root.data==="object"?root.data as Record<string,unknown>:{};
 const candidates=[raw,root.list,root.news,root.items,root.results,data.list,data.news,data.items,data.results,data.records];
 const list=candidates.find(Array.isArray);
 if(!Array.isArray(list))return [];
 const seen=new Set<string>();
 return list.flatMap((item:unknown)=>{
  if(!item||typeof item!=="object")return [];
  const r=item as Record<string,unknown>;
  const title=pick(r,["title","news_title","newsTitle","headline"]);
  const link=pick(r,["url","link","news_url","newsUrl","web_url","webUrl"]);
  if(typeof title!=="string"||!title.trim()||typeof link!=="string")return [];
  let url:URL;try{url=new URL(link);}catch{return [];}
  if(url.protocol!=="https:"||!/(^|\.)futunn\.com$|(^|\.)moomoo\.com$/.test(url.hostname))return [];
  if(seen.has(url.href))return [];seen.add(url.href);
  const timestamp=pick(r,["publish_time","publishTime","published_at","publishedAt","time","date","created_at"]);
  let publishedAt:string|null=null;
  if(typeof timestamp==="number"){const d=new Date(timestamp<1e12?timestamp*1000:timestamp);if(Number.isFinite(d.getTime()))publishedAt=d.toISOString();}
  else if(typeof timestamp==="string"){const d=new Date(timestamp);if(Number.isFinite(d.getTime()))publishedAt=d.toISOString();}
  const source=pick(r,["source","publisher","author","media"]);
  const image=pick(r,["image","image_url","imageUrl","cover","cover_url","coverUrl","thumbnail","thumbnail_url","thumbnailUrl","thumb","pic","pic_url","picUrl"]);
  let imageUrl:string|null=null;
  const imageValue=typeof image==="string"?image:image&&typeof image==="object"?pick(image as Record<string,unknown>,["url","src","original"]):null;
  if(typeof imageValue==="string"){try{const u=new URL(imageValue);if(u.protocol==="https:"&&u.username===""&&u.password==="")imageUrl=u.href;}catch{}}
  return [{title:title.trim().slice(0,180),url:url.href,publishedAt,source:typeof source==="string"?source.slice(0,60):"富途牛牛",imageUrl}];
 }).slice(0,12);
}
export async function GET(){
 try{
  const endpoint=process.env.FUTU_NEWS_API_URL || "https://ai-news-search.futunn.com/news_search";
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||!url.hostname.endsWith(".futunn.com"))throw Error("Invalid Futu endpoint");
  if(!url.searchParams.has("keyword"))url.searchParams.set("keyword","美聯儲 美股 全球經濟");
  if(!url.searchParams.has("lang"))url.searchParams.set("lang","zh-HK");
  if(!url.searchParams.has("sort"))url.searchParams.set("sort","2");
  if(!url.searchParams.has("type"))url.searchParams.set("type","1");
  const response=await fetch(url.toString(),{next:{revalidate:300},signal:AbortSignal.timeout(9000),headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("Futu news service unavailable");
  const news=normalized(await response.json());
  if(!news.length)throw Error("No compatible news results");
  return NextResponse.json({status:"ok",news,source:"富途牛牛",fetchedAt:new Date().toISOString(),refreshSeconds:300});
 }catch{
  return NextResponse.json({status:"unavailable",error:"富途新聞服務暫時無法取得可驗證的新聞資料，請前往富途閱讀最新快訊。",news:[],sourceUrl:"https://news.futunn.com/main"},{status:503});
 }
}
