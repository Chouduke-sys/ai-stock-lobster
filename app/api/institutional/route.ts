import { NextResponse } from "next/server";
export const runtime = "nodejs";
type RecordRow = Record<string,string>;
const n=(s?:string)=>{if(!s)return null;const v=Number(s.replace(/,/g,"").replace(/\+/g,"").trim());return Number.isFinite(v)?v:null;};
const day=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fields={
  symbol:["證券代號","股票代號","代號"],
  name:["證券名稱","股票名稱","名稱"],
  foreign:["外陸資買賣超股數(不含外資自營商)","外陸資買賣超股數","外資及陸資買賣超股數","外資買賣超股數"],
  trust:["投信買賣超股數"],
  dealer:["自營商買賣超股數","自營商買賣超股數(自行買賣)"]
};
function get(row:RecordRow,keys:string[]) {
  for(const key of keys) if(row[key]!==undefined) return row[key];
  return undefined;
}
function parseDate(s?:string) {
  if(!s)return null;
  const m=s.match(/(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if(!m)return null;
  const year=Number(m[1])+(m[1].length<=3?1911:0);
  return `${year}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const market=params.get("market")??"twse",investor=params.get("investor")??"all",side=params.get("side")??"buy";
  if(market!=="twse" || !["all","foreign","trust","dealer"].includes(investor) || !["buy","sell"].includes(side))
    return NextResponse.json({error:"目前僅提供上市股票法人排行；上櫃排行待完成可靠資料來源"},{status:400});
  try {
    const response=await fetch("https://openapi.twse.com.tw/v1/fund/T86",{next:{revalidate:300},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("Unavailable");
    const body:unknown=await response.json();
    if(!Array.isArray(body))throw new Error("Invalid data");
    const data=body as RecordRow[];
    const dates=data.map(row=>parseDate(row["日期"]??row["Date"])).filter((v):v is string=>!!v);
    const dataDate=dates[0]??null;
    if(!dataDate || dataDate!==day())return NextResponse.json({status:"not_available_today",error:"今日上市法人資料尚未公布，或來源未提供可驗證日期",dataDate},{status:409});
    const rows=data.flatMap(row=>{
      const symbol=get(row,fields.symbol)?.trim(),name=get(row,fields.name)?.trim();
      if(!symbol || !/^\d{4,6}$/.test(symbol))return [];
      const foreign=n(get(row,fields.foreign)),trust=n(get(row,fields.trust)),dealer=n(get(row,fields.dealer));
      const net=investor==="foreign"?foreign:investor==="trust"?trust:investor==="dealer"?dealer:foreign!==null&&trust!==null&&dealer!==null?foreign+trust+dealer:null;
      return net===null?[]:[{symbol,name:name??symbol,netShares:net}];
    }).sort((a,b)=>side==="buy"?b.netShares-a.netShares:a.netShares-b.netShares).slice(0,5);
    if(!rows.length)return NextResponse.json({error:"無法辨識法人欄位，未顯示排行"},{status:503});
    return NextResponse.json({status:"ok",market,investor,side,dataDate,rows,dataSource:"TWSE T86",isRealtime:false});
  } catch {return NextResponse.json({error:"上市法人資料目前無法取得"},{status:502});}
}
