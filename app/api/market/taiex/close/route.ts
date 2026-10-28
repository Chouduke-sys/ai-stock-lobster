import { NextResponse } from "next/server";
export const runtime="nodejs";
// Avoid build-time prerendering of the closing index; fetch fresh official data at request time.
export const dynamic="force-dynamic";
type Row={Date?:string;TAIEX?:string;Change?:string;TradeVolume?:string;TradeValue?:string;Transaction?:string};
function dateOf(s?:string):string|null {
 if(!s)return null;
 if(/^\d{7}$/.test(s))return `${Number(s.slice(0,3))+1911}-${s.slice(3,5)}-${s.slice(5,7)}`;
 if(/^\d{8}$/.test(s))return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
 const m=s.match(/^(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
 if(!m)return null;
 return `${Number(m[1])+(m[1].length<=3?1911:0)}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
function number(s?:string){if(!s)return null;const n=Number(s.replaceAll(",","").trim());return Number.isFinite(n)?n:null;}
type CloseRow={date:string;value:number;change:number|null;tradeVolume:number|null;tradeValue:number|null;transactions:number|null;source:string};
async function openApiRows():Promise<CloseRow[]>{
 const response=await fetch("https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",{next:{revalidate:180},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("OpenAPI HTTP "+response.status);
 const body:unknown=await response.json();
 if(!Array.isArray(body))throw Error("OpenAPI response invalid");
 return (body as Row[]).flatMap(r=>{
  const date=dateOf(r.Date),value=number(r.TAIEX);
  return date&&value!==null?[{date,value,change:number(r.Change),tradeVolume:number(r.TradeVolume),tradeValue:number(r.TradeValue),transactions:number(r.Transaction),source:"TWSE OpenAPI FMTQIK"}]:[];
 });
}
async function monthlyRows():Promise<CloseRow[]>{
 const month=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit"}).format(new Date()).replace("-","")+"01";
 const response=await fetch("https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date="+month+"&response=json",{next:{revalidate:180},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("TWSE monthly HTTP "+response.status);
 const body=await response.json() as {stat?:string;fields?:string[];data?:string[][]};
 if(body.stat!=="OK"||!Array.isArray(body.fields)||!Array.isArray(body.data))throw Error("TWSE monthly response invalid");
 const field=(s:string)=>body.fields!.findIndex(v=>v.includes(s));
 const di=field("日期"),vi=field("成交金額"),qi=field("成交股數"),ti=field("成交筆數"),ii=field("發行量加權股價指數"),ci=field("漲跌點數");
 if([di,vi,qi,ti,ii,ci].some(i=>i<0))throw Error("TWSE monthly fields missing");
 return body.data.flatMap(row=>{
  const date=dateOf(row[di]),value=number(row[ii]),tradeValue=number(row[vi]);
  return date&&value!==null&&tradeValue!==null?[{date,value,change:number(row[ci]),tradeVolume:number(row[qi]),tradeValue,transactions:number(row[ti]),source:"TWSE 月度市場成交資訊"}]:[];
 });
}
export async function GET(){
 const results=await Promise.allSettled([openApiRows(),monthlyRows()]);
 const rows=results.flatMap(r=>r.status==="fulfilled"?r.value:[]).sort((a,b)=>b.date.localeCompare(a.date));
 const latest=rows[0];
 if(!latest)return NextResponse.json({status:"unavailable",error:"證交所兩個官方資料來源目前均未提供可驗證成交金額"},{status:503,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({status:"ok",name:"加權指數收盤",date:latest.date,value:latest.value,change:latest.change,tradeVolume:latest.tradeVolume,tradeValue:latest.tradeValue,transactions:latest.transactions,dataSource:latest.source,isRealtime:false},{headers:{"Cache-Control":"public, s-maxage=180, stale-while-revalidate=60"}});
}
