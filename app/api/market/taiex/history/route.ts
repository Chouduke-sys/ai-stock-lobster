import { NextResponse } from "next/server";
export const runtime = "nodejs";
type Row = { Date?: string; TAIEX?: string };
const parseNumber = (value?: string): number | null => {
  if (!value || !/^[+-]?[0-9,]+(?:\.[0-9]+)?$/.test(value.trim())) return null;
  const n=Number(value.replace(/,/g,""));
  return Number.isFinite(n)?n:null;
};
const parseDate = (value?:string):string|null => {
  if(!value)return null;
  if(/^\d{7}$/.test(value))return `${Number(value.slice(0,3))+1911}-${value.slice(3,5)}-${value.slice(5,7)}`;
  if(/^\d{8}$/.test(value))return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
  const parts=value.match(/^(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if(!parts)return null;
  const year=Number(parts[1])+(parts[1].length<=3?1911:0);
  return `${year}-${parts[2].padStart(2,"0")}-${parts[3].padStart(2,"0")}`;
};
export async function GET() {
  try {
    const response=await fetch("https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",{
      next:{revalidate:3600},signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error("Index history unavailable");
    const body:unknown=await response.json();
    if(!Array.isArray(body))throw Error("Invalid index history");
    const rows=(body as Row[]).flatMap(row=>{
      const date=parseDate(row.Date),value=parseNumber(row.TAIEX);
      return date && value!==null ? [{date,value}] : [];
    }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
    if(rows.length<2)return NextResponse.json({error:"近期加權指數歷史資料不足"},{status:503});
    return NextResponse.json({status:"ok",dataSource:"TWSE FMTQIK（歷史收盤資料）",asOf:rows[rows.length-1].date,recent:rows,isRealtime:false});
  }catch{return NextResponse.json({error:"無法取得近期加權指數走勢"},{status:502});}
}
