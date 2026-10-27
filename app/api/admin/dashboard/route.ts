import {NextResponse} from "next/server";
import {adminIdentity} from "../../../../lib/admin-access";
import {analyticsConfigured,db} from "../../../../lib/analytics-store";
export const runtime="nodejs";
export async function GET(){
 if(!await adminIdentity())return NextResponse.json({error:"forbidden"},{status:403});
 if(!analyticsConfigured())return NextResponse.json({configured:false,reason:"尚未連接統計資料庫",stats:null});
 try{
  const now=new Date(),start=new Date(now.getTime()-8*86400000).toISOString();
  const r=await db("analytics_events?select=event_name,visitor_hash,user_hash,provider,created_at&created_at=gte."+encodeURIComponent(start)+"&order=created_at.desc&limit=10000");
  const rows=await r.json() as {event_name:string;visitor_hash:string;user_hash:string|null;provider:string|null;created_at:string}[];
  const day=(s:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(s));
  const today=day(now.toISOString()),todays=rows.filter(x=>day(x.created_at)===today);
  const page=todays.filter(x=>x.event_name==="page_view"),brief=todays.filter(x=>x.event_name==="morning_brief_view");
  const unique=(items:(string|null)[])=>new Set(items.filter(Boolean)).size;
  const last7=Array.from({length:7},(_,i)=>{const d=new Date(now.getTime()-(6-i)*86400000),date=day(d.toISOString()),daily=rows.filter(x=>day(x.created_at)===date);return {date,views:daily.filter(x=>x.event_name==="page_view").length,visitors:unique(daily.filter(x=>x.event_name==="page_view").map(x=>x.visitor_hash))};});
  return NextResponse.json({configured:true,limited:rows.length===10000,today,stats:{pageViews:page.length,uniqueVisitors:unique(page.map(x=>x.visitor_hash)),googleReaders:unique(brief.filter(x=>x.provider==="google").map(x=>x.user_hash)),briefReaders:unique(brief.map(x=>x.user_hash)),last7}});
 }catch{return NextResponse.json({configured:false,reason:"資料庫無法查詢，請確認資料表與環境設定",stats:null},{status:503});}
}
