import { NextResponse } from "next/server";
export const runtime="nodejs";
type Entry={symbol:string;name:string;foreign:number;trust:number;dealer:number;total:number};
type Day={date:string;rows:Entry[]};
function taiwanDate(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const x=(k:string)=>p.find(a=>a.type===k)?.value??"";return x("year")+"-"+x("month")+"-"+x("day");}
function number(v:unknown):number|null{if(typeof v!=="string"&&typeof v!=="number")return null;const s=String(v).replace(/,/g,"").trim();if(!/^[+-]?\d+$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)?n:null;}
async function fetchDay(date:string):Promise<Day|null>{
 try{
  const url="https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALL&date="+date.replace(/-/g,"");
  const res=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(6500)});
  if(!res.ok)return null;
  const raw:unknown=await res.json();if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;if(r.stat!=="OK"||!Array.isArray(r.fields)||!Array.isArray(r.data))return null;
  const fields=r.fields as string[];
  const names=["證券代號","證券名稱","外陸資買賣超股數(不含外資自營商)","投信買賣超股數","自營商買賣超股數","三大法人買賣超股數"];
  const ix=names.map(k=>fields.findIndex(f=>f.replace(/<[^>]+>/g,"").replace(/\s/g,"")===k));
  if(ix.some(i=>i<0))return null;
  const rows:Entry[]=[];
  for(const item of r.data){if(!Array.isArray(item))continue;const symbol=String(item[ix[0]]??"").trim();if(!/^\d{4}$/.test(symbol))continue;
   const values=ix.slice(2).map(i=>number(item[i]));if(values.some(x=>x===null))continue;
   const [foreign,trust,dealer,total]=values as number[];
   if(Math.abs(foreign+trust+dealer-total)>1)continue;
   rows.push({symbol,name:String(item[ix[1]]??symbol).trim(),foreign,trust,dealer,total});
  }
  return rows.length?{date,rows}:null;
 }catch{return null;}
}
export async function GET(req:Request){
 const q=new URL(req.url).searchParams;
 const investor=q.get("investor")??"all",side=q.get("side")??"buy",mode=q.get("mode")??"streak",market=q.get("market")??"twse";
 if(!["all","foreign","trust","dealer"].includes(investor)||!["buy","sell"].includes(side)||!["streak","sum"].includes(mode)||market!=="twse")
  return NextResponse.json({error:"連續五日目前僅支援上市股票，請選擇上市市場"},{status:400});
 const start=new Date(taiwanDate()+"T12:00:00+08:00");
 const dates=Array.from({length:13},(_,i)=>new Date(start.getTime()-i*86400000).toISOString().slice(0,10)).filter(d=>{const w=new Date(d+"T12:00:00+08:00").getUTCDay();return w!==0&&w!==6;});
 const results=await Promise.all(dates.map(fetchDay));
 const days=results.filter((d):d is Day=>d!==null).slice(0,5);
 if(days.length!==5)return NextResponse.json({error:"目前無法取得完整五個交易日的官方法人資料",availableDates:days.map(d=>d.date)},{status:503});
 const maps=days.map(d=>new Map(d.rows.map(r=>[r.symbol,r])));
 const key=investor==="all"?"total":investor as "foreign"|"trust"|"dealer";
 const rows=Array.from(maps[0].values()).flatMap(first=>{
  const items=maps.map(m=>m.get(first.symbol));
  if(items.some(x=>!x))return [];
  const values=items.map(x=>x![key]);const total=values.reduce((a,b)=>a+b,0);
  if(mode==="streak"&&!values.every(v=>side==="buy"?v>0:v<0))return [];
  if(mode==="sum"&&(side==="buy"?total<=0:total>=0))return [];
  return [{symbol:first.symbol,name:first.name,market:"twse",netShares:total,dailyShares:values}];
 }).sort((a,b)=>side==="buy"?b.netShares-a.netShares:a.netShares-b.netShares).slice(0,5);
 return NextResponse.json({status:"ok",market,investor,side,mode,dates:days.map(d=>d.date),rows,dataSource:"TWSE T86 五個交易日",isRealtime:false});
}
