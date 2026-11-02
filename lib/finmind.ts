import {cachedProvider} from "./provider-policy";
import {marketDate,strictNumber,taipeiDate} from "./market-data";
let blockedUntil=0;
const datasets=new Set(["TaiwanStockTradingDate","TaiwanStockInfo","TaiwanStockTotalInstitutionalInvestors","TaiwanStockTotalMarginPurchaseShortSale","TaiwanFuturesInstitutionalInvestors","TaiwanStockInstitutionalInvestorsBuySellWide"]);
export async function finmindRows(dataset:string,params:Record<string,string>={}):Promise<Record<string,unknown>[]|null>{
 if(!datasets.has(dataset)||Date.now()<blockedUntil)return null;
 const marketWide=dataset==="TaiwanStockInstitutionalInvestorsBuySellWide";
 if(marketWide&&(!process.env.FINMIND_API_TOKEN||process.env.FINMIND_MARKET_WIDE!=="1"))return null;
 const key="finmind:"+dataset+":"+new URLSearchParams(params);
 return cachedProvider(key,dataset==="TaiwanStockTradingDate"||dataset==="TaiwanStockInfo"?3600000:120000,async()=>{
  const url=new URL("https://api.finmindtrade.com/api/v4/data");
  url.searchParams.set("dataset",dataset);
  for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
  const headers:Record<string,string>={Accept:"application/json"};
  if(process.env.FINMIND_API_TOKEN)headers.Authorization="Bearer "+process.env.FINMIND_API_TOKEN;
  const r=await fetch(url,{next:{revalidate:dataset==="TaiwanStockTradingDate"||dataset==="TaiwanStockInfo"?3600:120},signal:AbortSignal.timeout(4500),headers});
  if(!r.ok){if(r.status===429)blockedUntil=Date.now()+15*60000;return null;}
  const body=await r.json();
  if(body?.status===429){blockedUntil=Date.now()+15*60000;return null;}
  return body?.status===200&&Array.isArray(body.data)?body.data:null;
 });
}
export function parseFinmindMargin(rows:Record<string,unknown>[],date:string){
 const finance=rows.find(r=>marketDate(r.date)===date&&r.name==="MarginPurchaseMoney");
 const short=rows.find(r=>marketDate(r.date)===date&&r.name==="ShortSale");
 if(!finance||!short)return null;
 const f=strictNumber(finance.TodayBalance),fp=strictNumber(finance.YesBalance),s=strictNumber(short.TodayBalance),sp=strictNumber(short.YesBalance);
 if([f,fp,s,sp].some(n=>n===null||n<0))return null;
 return {date,financingBalance:f!/1e8,financingChange:(f!-fp!)/1e8,shortBalance:s,shortChange:s!-sp!,source:"FinMind（融資金額元轉億元；融券張）"};
}
export function parseFinmindInstitutional(rows:Record<string,unknown>[],date:string){
 const names=["Foreign_Investor","Foreign_Dealer_Self","Investment_Trust","Dealer_self","Dealer_Hedging"];
 const by=(name:string)=>rows.find(r=>marketDate(r.date)===date&&r.name===name);
 const net=(name:string)=>{const r=by(name);if(!r)return null;const b=strictNumber(r.buy),s=strictNumber(r.sell);return b===null||s===null||b<0||s<0?null:b-s;};
 if(names.some(name=>net(name)===null))return null;
 const foreign=net("Foreign_Investor")!+(net("Foreign_Dealer_Self")??0),trust=net("Investment_Trust")!,dealer=net("Dealer_self")!+net("Dealer_Hedging")!;
 const total=net("total");
 if(total!==null&&Math.abs(foreign+trust+dealer-total)>1)return null;
 return {date,foreignYi:foreign/1e8,trustYi:trust/1e8,dealerYi:dealer/1e8,totalYi:(foreign+trust+dealer)/1e8,foreignFuturesNet:null,source:"FinMind 台灣市場整體法人買賣（億元）"};
}
export function parseFinmindFutures(rows:Record<string,unknown>[],date:string){
 const row=rows.find(r=>marketDate(r.date)===date&&["外資","外資及陸資","Foreign_Investor"].includes(String(r.institutional_investors))&&["臺股期貨","台股期貨","TX"].includes(String(r.name??r.futures_id??"")));
 if(!row)return null;
 const long=strictNumber(row.long_open_interest_balance_volume),short=strictNumber(row.short_open_interest_balance_volume);
 return long!==null&&short!==null&&Number.isSafeInteger(long)&&Number.isSafeInteger(short)&&long>=0&&short>=0?{date,foreignTxNet:long-short,putCallVolume:null,putCallOpenInterest:null,source:"FinMind 臺股期貨外資未平倉淨口數"}:null;
}
export async function finmindPublication(kind:"margin"|"institutional"|"futures",dates:string[]){
 const dataset=kind==="margin"?"TaiwanStockTotalMarginPurchaseShortSale":kind==="institutional"?"TaiwanStockTotalInstitutionalInvestors":"TaiwanFuturesInstitutionalInvestors";
 const sorted=[...new Set(dates)].filter(d=>marketDate(d)===d).sort();
 if(!sorted.length)return null;
 const rows=await finmindRows(dataset,{start_date:sorted[0],end_date:sorted.at(-1)!,...(kind==="futures"?{data_id:"TX"}:{})});
 if(!rows)return null;
 for(const date of sorted.reverse()){
  const parsed=kind==="margin"?parseFinmindMargin(rows,date):kind==="institutional"?parseFinmindInstitutional(rows,date):parseFinmindFutures(rows,date);
  if(parsed)return parsed;
 }
 return null;
}
