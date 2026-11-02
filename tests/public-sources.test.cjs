// Synthetic fixtures, never production quotations.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {load,response,clock}=require("./load-ts.cjs");
test("FinMind margin uses monetary balances, not margin trading-unit balances",()=>{
 const {parseFinmindMargin}=load("lib/finmind.ts");
 const rows=[{date:"2026-10-30",name:"MarginPurchaseMoney",TodayBalance:10100000000,YesBalance:10000000000},{date:"2026-10-30",name:"ShortSale",TodayBalance:520,YesBalance:500}];
 const r=parseFinmindMargin(rows,"2026-10-30");assert.equal(r.financingBalance,101);assert.equal(r.financingChange,1);assert.equal(r.shortChange,20);
 assert.equal(parseFinmindMargin(rows,"2026-11-02"),null);
});
test("FinMind aggregate requires all components and reconciles the published total",()=>{
 const {parseFinmindInstitutional}=load("lib/finmind.ts");
 const rows=["Foreign_Investor","Foreign_Dealer_Self","Investment_Trust","Dealer_self","Dealer_Hedging"].map(name=>({date:"2026-10-30",name,buy:100000000,sell:0}));
 rows.push({date:"2026-10-30",name:"total",buy:500000000,sell:0});
 assert.equal(parseFinmindInstitutional(rows,"2026-10-30").totalYi,5);
 rows.pop();rows.pop();assert.equal(parseFinmindInstitutional(rows,"2026-10-30"),null);
});
test("FinMind futures selects TX foreign open-interest volume, not money",()=>{
 const {parseFinmindFutures}=load("lib/finmind.ts");
 const row={date:"2026-10-30",futures_id:"TX",institutional_investors:"外資",long_open_interest_balance_volume:100,short_open_interest_balance_volume:150,long_open_interest_balance_amount:999999};
 assert.equal(parseFinmindFutures([row],"2026-10-30").foreignTxNet,-50);
 assert.equal(parseFinmindFutures([{...row,futures_id:"MTX"}],"2026-10-30"),null);
});
function yahooFixture(side="buy"){
 const rows=Array.from({length:5},(_,i)=>'<li><div>'+ (i+1)+' 公司'+i+' '+(2300+i)+'.TW</div><div>100</div><div>1</div><div>'+(side==="buy"?100:10)+'</div><div>'+(side==="buy"?10:100)+'</div><div>90</div></li>').join("");
 return '資料時間：2026/10/30 買進張數 賣出張數 '+(side==="buy"?"買超":"賣超")+'張數<div class="table-body wrapper"><ul>'+rows+'</ul></div>';
}
test("Yahoo rank validates dates, units, market suffixes and publishes precision",()=>{
 const {parseYahooRank}=load("lib/public-institutional.ts");
 const q={market:"twse",investor:"foreign",side:"buy"};
 const r=parseYahooRank(yahooFixture(),q,"2026-10-30","2026-11-02");
 assert.equal(r.rows.length,5);assert.equal(r.rows[0].netShares,90000);assert.equal(r.precision,"published_lots");
 assert.equal(parseYahooRank(yahooFixture(),{...q,investor:"all"},"2026-10-30","2026-11-02"),null);
 assert.equal(parseYahooRank(yahooFixture(),q,"2026-11-02","2026-11-02"),null);
 assert.equal(parseYahooRank(yahooFixture(),{...q,market:"tpex"},"2026-10-30","2026-11-02"),null);
});
test("Yahoo sell rank uses negative net, never turns an unsigned sell quantity into buying",()=>{
 const {parseYahooRank}=load("lib/public-institutional.ts");
 const r=parseYahooRank(yahooFixture("sell"),{market:"twse",investor:"foreign",side:"sell"},"2026-10-30","2026-11-02");
 assert.equal(r.rows[0].netShares,-90000);
});
test("provider cache coalesces concurrent requests and handles a synchronous failure",async()=>{
 const p=load("lib/provider-policy.ts");let calls=0,release;
 const task=()=>{calls++;return new Promise(resolve=>release=resolve);};
 const a=p.cachedProvider("test",1000,task),b=p.cachedProvider("test",1000,task);
 assert.equal(calls,1);release({date:"2026-10-30"});await Promise.all([a,b]);
 await p.cachedProvider("test",1000,task);assert.equal(calls,1);
 assert.equal(await p.cachedProvider("bad",1000,()=>{throw Error("failure");}),null);
 assert.equal(p.providerObservations().find(x=>x.id==="bad").status,"unavailable");
});
test("FinMind market-wide rows are not claimed available without configured access",async()=>{
 let calls=0;
 const f=load("lib/finmind.ts",{}, {process:{env:{}},fetch:async()=>{calls++;throw Error("unexpected");}});
 assert.equal(await f.finmindRows("TaiwanStockInstitutionalInvestorsBuySellWide",{start_date:"2026-10-30"}),null);
 assert.equal(calls,0);
});
test("FinMind rate limiting opens a cooldown, allowing other providers to take over",async()=>{
 let calls=0;
 const f=load("lib/finmind.ts",{}, {process:{env:{}},fetch:async()=>{calls++;return {ok:false,status:429};}});
 assert.equal(await f.finmindRows("TaiwanStockTradingDate"),null);
 assert.equal(await f.finmindRows("TaiwanStockTotalInstitutionalInvestors"),null);
 assert.equal(calls,1);
});
test("public calendar works when every exchange endpoint is down",async()=>{
 const calendar=load("lib/trading-calendar.ts",{
 "./finmind":{finmindRows:async()=>[{date:"2026-10-30"},{date:"2026-11-02"},{date:"2026-12-31"}]},
 "./yahoo-quote":{getQuote:async()=>({quoteDate:"2026-10-30",time:"2026-10-30T05:30:00Z",trendDates:["2026-10-30"],trend5d:[100]})}
 },{fetch:async()=>{throw Error("official endpoint unavailable");}});
 const c=await calendar.taiwanCalendar(new Date("2026-11-02T00:45:00Z"));
 assert.equal(c.referenceDate,"2026-10-30");assert.equal(c.isTradingDay,true);assert.ok(c.source.includes("FinMind"));
});
test("public rank is served without invoking official rank endpoints",async()=>{
 let calls=0;
 const route=load("app/api/institutional/route.ts",{"next/server":response,
 "../../../lib/trading-calendar":{taiwanCalendar:async()=>({referenceDate:"2026-10-30",latestCompletedDate:"2026-11-02"})},
 "../../../lib/public-institutional":{yahooRank:async()=>({date:"2026-10-30",source:"fixture public provider",precision:"published_lots",coverage:"source_ranked_top100",rows:[{symbol:"2330",name:"fixture",market:"twse",netShares:1000}]}),finmindRank:async()=>null}
 },{fetch:async()=>{calls++;throw Error("exchange must not be used");}});
 const r=await route.GET(new Request("https://site.invalid/api/institutional?market=twse&investor=foreign&side=buy"));
 assert.equal(r.status,200);assert.equal(r.body.publicationPending,true);assert.equal(calls,0);
});

function fallbackRoute(market,payload){
 return load("app/api/institutional/route.ts",{"next/server":response,
 "../../../lib/trading-calendar":{taiwanCalendar:async()=>({referenceDate:"2026-10-30",latestCompletedDate:"2026-11-02"})},
 "../../../lib/public-institutional":{yahooRank:async()=>null,finmindRank:async()=>null}
 },{URLSearchParams,Date:clock("2026-11-02T08:00:00Z"),fetch:async url=>({ok:true,json:async()=>market==="tpex"?payload:String(url).includes("date=20261030")?payload:{stat:"not yet published"}})});
}
test("last-resort TWSE ranking includes foreign dealers and keeps the actual publication date",async()=>{
 const fields=["證券代號","證券名稱","外陸資買賣超股數(不含外資自營商)","投信買賣超股數","自營商買賣超股數","三大法人買賣超股數","外資自營商買賣超股數"];
 const payload={stat:"OK",date:"20261030",fields,data:Array.from({length:5},(_,i)=>[String(2300+i),"fixture",100,20,30,155,5])};
 const route=fallbackRoute("twse",payload);
 const r=await route.GET(new Request("https://site.invalid/api/institutional?market=twse&investor=all&side=buy"));
 assert.equal(r.status,200);assert.equal(r.body.dataDate,"2026-10-30");assert.equal(r.body.publicationPending,true);assert.equal(r.body.rows[0].netShares,155);
});
test("TPEx ranking uses the published combined foreign-investor field",async()=>{
 const payload=Array.from({length:5},(_,i)=>({Date:"1151030",SecuritiesCompanyCode:String(5300+i),CompanyName:"fixture",
 "Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference":"100",
 "ForeignDealers-Difference":"5","ForeignInvestorsInclude MainlandAreaInvestors-Difference":"105",
 "SecuritiesInvestmentTrustCompanies-Difference":"20","Dealers-Difference":"30","TotalDifference":"155"}));
 const route=fallbackRoute("tpex",payload);
 const r=await route.GET(new Request("https://site.invalid/api/institutional?market=tpex&investor=all&side=buy"));
 assert.equal(r.status,200);assert.equal(r.body.rows[0].netShares,155);
});

test("official fallback probes the known prior session across a long holiday without scanning every day",async()=>{
 let calls=0;
 const fields=["證券代號","證券名稱","外陸資買賣超股數(不含外資自營商)","投信買賣超股數","自營商買賣超股數","三大法人買賣超股數","外資自營商買賣超股數"];
 const payload={stat:"OK",date:"20260211",fields,data:Array.from({length:5},(_,i)=>[String(2300+i),"fixture",100,20,30,155,5])};
 const route=load("app/api/institutional/route.ts",{"next/server":response,
 "../../../lib/trading-calendar":{taiwanCalendar:async()=>({referenceDate:"2026-02-11",latestCompletedDate:"2026-02-23"})},
 "../../../lib/public-institutional":{yahooRank:async()=>null,finmindRank:async()=>null}
 },{URLSearchParams,Date:clock("2026-02-23T08:00:00Z"),fetch:async url=>{calls++;return {ok:true,json:async()=>String(url).includes("date=20260211")?payload:{stat:"not yet published"}};}});
 const r=await route.GET(new Request("https://site.invalid/api/institutional?market=twse&investor=all&side=buy"));
 assert.equal(r.status,200);assert.equal(r.body.dataDate,"2026-02-11");assert.ok(calls<=4);
});
