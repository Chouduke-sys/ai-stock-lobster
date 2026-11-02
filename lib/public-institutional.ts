import {htmlText} from "./market-table-extractor";
import {marketDate,strictNumber,taipeiDate} from "./market-data";
import {cachedProvider} from "./provider-policy";
import {finmindRows} from "./finmind";
export type Investor="all"|"foreign"|"trust"|"dealer";
export type Market="twse"|"tpex"|"all";
export type RankQuery={market:Market;investor:Investor;side:"buy"|"sell"};
export type RankResult={date:string;source:string;precision:"shares"|"published_lots";coverage:string;rows:{symbol:string;name:string;market:"twse"|"tpex";netShares:number}[]};
export function parseYahooRank(html:string,query:RankQuery,minDate:string,today:string):RankResult|null{
 if(query.investor==="all")return null; // Component top lists cannot be summed into a market-wide total rank.
 const plain=htmlText(html);
 const match=plain.match(/資料時間\s*[:：]\s*(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
 const date=match?marketDate(match[1]+"-"+match[2].padStart(2,"0")+"-"+match[3].padStart(2,"0")):null;
 if(!date||date<minDate||date>today||!/買進張數\s+賣出張數\s+(?:買超|賣超)張數/.test(plain))return null;
 const body=html.split(/class=["']table-body\s/)[1];
 if(!body)return null;
 const rows:RankResult["rows"]=[];
 for(const item of body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
  const text=htmlText(item[1]),symbol=text.match(/\b(\d{4})\.(TW|TWO)\b/);
  if(!symbol)continue;
  const market=symbol[2]==="TW"?"twse":"tpex";
  if(query.market!=="all"&&query.market!==market)continue;
  const tail=text.slice((symbol.index??0)+symbol[0].length).trim().split(/\s+/);
  // Verified headers: price, price change, buy lots, sell lots, net lots.
  const buy=strictNumber(tail[2]),sell=strictNumber(tail[3]),published=strictNumber(tail[4]);
  if(buy===null||sell===null||published===null||buy<0||sell<0)continue;
  const net=query.side==="sell"?-Math.abs(published):published;
  if(Math.abs(buy-sell-net)>1)continue; // Published lots can be rounded, never call these exact share counts.
  if(query.side==="buy"?net<=0:net>=0)continue;
  const name=text.slice(0,symbol.index).replace(/^\d+\s+/,"").trim();
  if(!name||!Number.isSafeInteger(net*1000))continue;
  rows.push({symbol:symbol[1],name,market,netShares:net*1000});
 }
 const unique=[...new Map(rows.map(row=>[row.market+":"+row.symbol,row])).values()];
 if(unique.length<5)return null;
 unique.sort((a,b)=>query.side==="buy"?b.netShares-a.netShares:a.netShares-b.netShares);
 return {date,source:"Yahoo 股市公開"+(query.investor==="foreign"?"外資":query.investor==="trust"?"投信":"自營商")+"排行",precision:"published_lots",coverage:"source_ranked_top100",rows:unique.slice(0,5)};
}
export async function yahooRank(query:RankQuery,minDate:string):Promise<RankResult|null>{
 if(query.investor==="all")return null;
 const category=query.investor==="foreign"?"foreign-investor":query.investor==="trust"?"investment-trust":"dealer";
 const exchange=query.market==="twse"?"TAI":query.market==="tpex"?"TWO":"ALL";
 return cachedProvider("yahoo:rank:"+JSON.stringify(query)+":"+minDate,30000,async()=>{
  const url="https://tw.stock.yahoo.com/rank/"+category+"-"+query.side+"/?exchange="+exchange;
  const r=await fetch(url,{next:{revalidate:30},signal:AbortSignal.timeout(5000),headers:{"User-Agent":"Mozilla/5.0","Accept-Language":"zh-TW"}});
  return r.ok?parseYahooRank(await r.text(),query,minDate,taipeiDate()):null;
 });
}
export async function finmindRank(query:RankQuery,minDate:string):Promise<RankResult|null>{
 if(!process.env.FINMIND_API_TOKEN||process.env.FINMIND_MARKET_WIDE!=="1")return null;
 const [raw,info]=await Promise.all([finmindRows("TaiwanStockInstitutionalInvestorsBuySellWide",{start_date:minDate,end_date:taipeiDate()}),finmindRows("TaiwanStockInfo")]);
 if(!raw||!info)return null;
 const markets=new Map(info.flatMap(row=>row.type==="twse"||row.type==="tpex"?[[String(row.stock_id),{market:row.type as "twse"|"tpex",name:String(row.stock_name)}] as const]:[]));
 const dates=[...new Set(raw.map(row=>marketDate(row.date)).filter((d):d is string=>Boolean(d)&&d!>=minDate&&d!<=taipeiDate()))].sort().reverse();
 for(const date of dates){
  const rows:RankResult["rows"]=[];
  for(const r of raw.filter(row=>marketDate(row.date)===date)){
   const symbol=String(r.stock_id??""),metadata=markets.get(symbol);
   if(!/^\d{4}$/.test(symbol)||!metadata||query.market!=="all"&&query.market!==metadata.market)continue;
   const net=(prefix:string)=>{const b=strictNumber(r[prefix+"_buy"]),s=strictNumber(r[prefix+"_sell"]);return b!==null&&s!==null&&Number.isSafeInteger(b)&&Number.isSafeInteger(s)?b-s:null;};
   const f=net("Foreign_Investor"),fs=net("Foreign_Dealer_Self"),t=net("Investment_Trust"),d=net("Dealer_self"),h=net("Dealer_Hedging");
   if([f,fs,t,d,h].some(v=>v===null))continue;
   const value=query.investor==="foreign"?f!+fs!:query.investor==="trust"?t!:query.investor==="dealer"?d!+h!:f!+fs!+t!+d!+h!;
   if(query.side==="buy"?value<=0:value>=0)continue;
   rows.push({symbol,name:metadata.name,market:metadata.market,netShares:value});
  }
  if(rows.length>=5)return {date,rows:rows.sort((a,b)=>query.side==="buy"?b.netShares-a.netShares:a.netShares-b.netShares).slice(0,5),source:"FinMind 全市場法人明細",precision:"shares",coverage:"market_wide"};
 }
 return null;
}
