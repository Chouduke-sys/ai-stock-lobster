import { NextResponse } from "next/server";
export const runtime="nodejs";
type Row={Date?:string;TAIEX?:string;Change?:string};
function dateOf(s?:string):string|null {
 if(!s)return null;
 if(/^\d{7}$/.test(s))return `${Number(s.slice(0,3))+1911}-${s.slice(3,5)}-${s.slice(5,7)}`;
 if(/^\d{8}$/.test(s))return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
 const m=s.match(/^(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
 if(!m)return null;
 return `${Number(m[1])+(m[1].length<=3?1911:0)}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
function number(s?:string){if(!s)return null;const n=Number(s.replaceAll(",","").trim());return Number.isFinite(n)?n:null;}
export async function GET(){
 try {
 const response=await fetch("https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",{next:{revalidate:300},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("Source failed");
 const body:unknown=await response.json();if(!Array.isArray(body))throw Error("Unexpected response");
 const rows=(body as Row[]).flatMap(r=>{const date=dateOf(r.Date),value=number(r.TAIEX);return date&&value!==null?[{date,value,change:number(r.Change)}]:[]}).sort((a,b)=>a.date.localeCompare(b.date));
 const latest=rows[rows.length-1];if(!latest)return NextResponse.json({error:"尚無可驗證的加權指數收盤資料"},{status:503});
 return NextResponse.json({status:"ok",name:"加權指數收盤",date:latest.date,value:latest.value,change:latest.change,dataSource:"TWSE FMTQIK（正式收盤日資料）",isRealtime:false});
 }catch{return NextResponse.json({error:"加權指數收盤資料暫時無法取得"},{status:502});}
}
