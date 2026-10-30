import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
type Stock={symbol:string;name:string;market:string};
const sources=[
 {market:"TWSE",url:"https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"},
 {market:"TPEX",url:"https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"}
];
function extract(row:Record<string,unknown>,keys:string[]):string{
 for(const key of keys){const value=row[key];if(typeof value==="string"&&value.trim())return value.trim();}
 return "";
}
export async function GET(req:NextRequest){
 const q=(req.nextUrl.searchParams.get("q")??"").trim().toLowerCase();
 if(q.length<1||q.length>40)return NextResponse.json({stocks:[]});
 const batches=await Promise.all(sources.map(async source=>{
  try{
   const res=await fetch(source.url,{next:{revalidate:86400},signal:AbortSignal.timeout(8000)});
   if(!res.ok)return [] as Stock[];
   const data=await res.json() as unknown;
   if(!Array.isArray(data))return [] as Stock[];
   return data.flatMap((value:unknown)=>{
    if(!value||typeof value!=="object")return [];
    const row=value as Record<string,unknown>;
    const symbol=extract(row,["Code","SecuritiesCompanyCode","證券代號","股票代號","代號"]);
    const name=extract(row,["Name","CompanyName","證券名稱","股票名稱","名稱"]);
    return /^\d{4,6}$/.test(symbol)&&name?[{symbol,name,market:source.market}]:[];
   });
  }catch{return [] as Stock[];}
 }));
 const seen=new Set<string>();
 const stocks=batches.flat().filter(x=>{if(seen.has(x.symbol))return false;seen.add(x.symbol);return true;})
  .filter(x=>x.symbol.includes(q)||x.name.toLowerCase().includes(q))
  .sort((a,b)=>{
   const score=(x:Stock)=>x.symbol===q?0:x.name.toLowerCase()===q?1:x.name.toLowerCase().startsWith(q)?2:x.symbol.startsWith(q)?3:4;
   return score(a)-score(b)||a.symbol.localeCompare(b.symbol);
  }).slice(0,12);
 return NextResponse.json({status:"ok",stocks},{headers:{"Cache-Control":"public, s-maxage=300"}});
}
