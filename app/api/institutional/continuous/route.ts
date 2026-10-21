import { NextResponse } from "next/server";
export const runtime="nodejs";
type Entry={symbol:string;name:string;foreign:number;trust:number;dealer:number;total:number};
type Day={date:string;rows:Entry[]};
type FetchResult={day:Day|null;reason:string};
function taiwanDate(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const x=(k:string)=>p.find(a=>a.type===k)?.value??"";return x("year")+"-"+x("month")+"-"+x("day");}
function number(v:unknown):number|null{if(typeof v!=="string"&&typeof v!=="number")return null;const s=String(v).replace(/,/g,"").trim();if(!/^[+-]?\d+$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)?n:null;}
async function fetchDay(date:string):Promise<FetchResult>{
 try{
  const url="https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALL&date="+date.replace(/-/g,"");
  const res=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(6500)});
  if(!res.ok)return {day:null,reason:"HTTP "+res.status};
  const raw:unknown=await res.json();if(!raw||typeof raw!=="object"||Array.isArray(raw))return {day:null,reason:"非預期回應格式"};
  const r=raw as Record<string,unknown>;if(r.stat!=="OK"||!Array.isArray(r.fields)||!Array.isArray(r.data))return {day:null,reason:String(r.stat??"缺少資料欄位")};
  const fields=r.fields as string[];
  const normalize=(v:string)=>v.replace(/<[^>]+>/g,"").replace(/[\s（）()]/g,"").trim();
  const match=(name:string)=>fields.findIndex(f=>normalize(f)===normalize(name));
  const ix=["證券代號","證券名稱","外陸資買賣超股數(不含外資自營商)","投信買賣超股數","自營商買賣超股數","三大法人買賣超股數"].map(match);
  if(ix.some(i=>i<0))return {day:null,reason:"缺少欄位："+ix.map((i,k)=>i<0?["代號","名稱","外資","投信","自營商","三大法人合計"][k]:"").filter(Boolean).join("、")};
  const rows:Entry[]=[];
  for(const item of r.data){if(!Array.isArray(item))continue;const symbol=String(item[ix[0]]??"").trim();if(!/^\d{4}$/.test(symbol))continue;
   const values=ix.slice(2).map(i=>number(item[i]));if(values.some(x=>x===null))continue;
   const [foreign,trust,dealer,total]=values as number[];
   // Trust the TWSE published total; do not discard rows for different institutional accounting definitions.
   rows.push({symbol,name:String(item[ix[1]]??symbol).trim(),foreign,trust,dealer,total});
  }
  return rows.length?{day:{date,rows},reason:"OK"}:{day:null,reason:"股票資料解析後為空"};
 }catch(e){return {day:null,reason:e instanceof Error?e.name:"請求失敗"};}
}
export async function GET(req:Request){
 const q=new URL(req.url).searchParams;
 const investor=q.get("investor")??"all",side=q.get("side")??"buy",mode=q.get("mode")??"streak",market=q.get("market")??"twse";
 if(!["all","foreign","trust","dealer"].includes(investor)||!["buy","sell"].includes(side)||!["streak","sum"].includes(mode)||market!=="twse")
  return NextResponse.json({error:"連續三日目前僅支援上市股票，請選擇上市市場"},{status:400});
 const start=new Date(taiwanDate()+"T12:00:00+08:00");
 const dates=Array.from({length:15},(_,i)=>new Date(start.getTime()-i*86400000).toISOString().slice(0,10)).filter(d=>{const w=new Date(d+"T12:00:00+08:00").getUTCDay();return w!==0&&w!==6;});
 const days:Day[]=[];
 const diagnostics:{date:string;reason:string}[]=[];
 // Query in small batches instead of hitting TWSE with 9+ simultaneous requests.
 for(let i=0;i<dates.length&&days.length<3;i+=2){
  const batch=await Promise.all(dates.slice(i,i+2).map(fetchDay));
  for(let j=0;j<batch.length;j++){const result=batch[j];if(result.day)days.push(result.day);else diagnostics.push({date:dates[i+j],reason:result.reason});}
 }
 days.sort((a,b)=>b.date.localeCompare(a.date));
 days.splice(3);
 if(days.length!==3)return NextResponse.json({error:"目前無法取得完整三個交易日的官方法人資料",availableDates:days.map(d=>d.date),diagnostics},{status:503});
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
 return NextResponse.json({status:"ok",market,investor,side,mode,dates:days.map(d=>d.date),rows,dataSource:"TWSE T86 三個交易日",isRealtime:false});
}
