// All numeric market examples in this file are synthetic fixtures, not quotations.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {load,response,clock}=require("./load-ts.cjs");
test("TAIFEX parses net CONTRACT COUNTS, never contract value, with matching dates",()=>{
 const {parseTaifexPositioning}=load("lib/taifex-positioning.ts");
 const ratio={Date:"20261030",PutVolume:"120",CallVolume:"100","PutCallVolumeRatio%":"120",PutOI:"150",CallOI:"100","PutCallOIRatio%":"150"};
 const row={Date:"20261030",ContractCode:"臺股期貨",Item:"外資及陸資","OpenInterest(Net)":"-12","ContractValueofOpenInterest(Net)(Thousands)":"-999999"};
 const result=parseTaifexPositioning([ratio],[{...row,ContractCode:"小型臺指期貨"},row],"2026-10-30");
 assert.equal(result.foreignTxNet,-12);assert.equal(result.putCallVolume,120);assert.equal(result.putCallOpenInterest,150);
 assert.equal(parseTaifexPositioning([ratio],[row],"2026-10-29"),null);
 const wrong=parseTaifexPositioning([{...ratio,"PutCallVolumeRatio%":"1.2"}],[],"2026-10-30");
 assert.equal(wrong.putCallVolume,null);
});
test("global quote ignores five-day chartPreviousClose and uses dated previous close",async()=>{
 const stamp=iso=>Date.parse(iso)/1000;
 const quote=load("lib/yahoo-quote.ts",{}, {Date:clock("2026-11-02T01:01:00Z"),fetch:async()=>({ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:110,regularMarketTime:stamp("2026-11-02T01:00:00Z"),exchangeTimezoneName:"Asia/Taipei",chartPreviousClose:100},
 timestamp:[stamp("2026-10-29T01:00:00Z"),stamp("2026-10-30T01:00:00Z"),stamp("2026-11-02T01:00:00Z")],indicators:{quote:[{close:[100,108,110]}]}}]}})})});
 const result=await quote.getQuote("test","^TEST");
 assert.ok(Math.abs(result.changePct-1.85185185)<0.00001);
});
test("global quote rejects stale quotes and does not fabricate missing-session moves",async()=>{
 const stamp=Date.parse("2026-10-20T01:00:00Z")/1000;
 const quote=load("lib/yahoo-quote.ts",{}, {Date:clock("2026-11-02T01:00:00Z"),fetch:async()=>({ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:110,regularMarketTime:stamp},timestamp:[stamp],indicators:{quote:[{close:[110]}]}}]}})})});
 const result=await quote.getQuote("test","^TEST");assert.equal(result.value,null);assert.equal(result.changePct,null);
});
test("night route uses configured licensed provider before public HTML",async()=>{
 const calls=[];
 const route=load("app/api/market/taiex/night/route.ts",{"next/server":response}, {
 Date:clock("2026-11-02T10:00:00Z"),
 process:{env:{TAIFEX_NIGHT_QUOTE_URL:"https://feed.example/tx"}},
 fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({symbol:"TX",contract:"202611",price:110,referencePrice:108,quoteTime:"2026-11-02T09:59:55Z"})};}
 });
 const result=await route.GET();assert.equal(result.status,200);assert.equal(result.body.contractVerified,true);
 assert.equal(calls.length,1);assert.equal(calls[0],"https://feed.example/tx");
});
test("night route rejects stale licensed values instead of manufacturing a quote",async()=>{
 const route=load("app/api/market/taiex/night/route.ts",{"next/server":response,"../../../../../lib/trading-calendar":{taiwanCalendar:async()=>({isTradingDay:false})}}, {
 Date:clock("2026-11-02T10:00:00Z"),process:{env:{TAIFEX_NIGHT_QUOTE_URL:"https://feed.example/tx"}},
 fetch:async()=>({ok:true,json:async()=>({symbol:"TX",contract:"202611",price:110,quoteTime:"2026-11-02T09:00:00Z"})})
 });
 const result=await route.GET();assert.equal(result.status,502);assert.equal(result.body.price,undefined);
});
function morning(overrides={},globals={}){
 return load("app/api/market/morning-brief/route.ts",{
 "next/server":response,
 "next-auth":{getServerSession:async()=>({user:{email:"test@example.invalid"}})},
 "../../../../lib/auth":{authOptions:{}},
 ...overrides
 },{Date:clock("2026-11-02T08:00:00Z"),process:{env:{CRON_SECRET:"test-only-secret"}},...globals});
}
test("ordinary report requests return frozen content after market close without regenerating",async()=>{
 let fetches=0;
 const brief={status:"ok",reportDate:"2026-11-02",stance:"frozen"};
 const route=morning({"../../../../lib/morning-snapshot":{loadMorningSnapshot:async()=>({brief,snapshot:{version:2}})}},{fetch:async()=>{fetches++;throw Error("unexpected source request");}});
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief"));
 assert.equal(result.status,200);assert.equal(result.body.stance,"frozen");assert.equal(fetches,0);
});
test("ordinary report requests refuse to backfill an absent snapshot after close",async()=>{
 const route=morning({"../../../../lib/morning-snapshot":{loadMorningSnapshot:async()=>null}});
 assert.equal((await route.GET(new Request("https://site.invalid/api/market/morning-brief"))).status,503);
});
test("manual late capture is rejected even with valid cron credentials",async()=>{
 const route=morning();
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?capture=1",{headers:{Authorization:"Bearer test-only-secret"}}));
 assert.equal(result.status,409);
});
test("member access does not authorize snapshot generation",async()=>{
 const route=morning({}, {Date:clock("2026-11-02T00:45:00Z")});
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?capture=1"));
 assert.equal(result.status,403);
});
test("archive refuses a delayed execution after opening and never fetches",async()=>{
 const script=load("scripts/archive-daily-review.cjs",{"node:fs":{existsSync:()=>false}},{
 Date:clock("2026-11-02T01:01:00Z"),
 process:{env:{CRON_SECRET:"test-only"},argv:["node","script","morning"],cwd:()=>"/fixture"},
 fetch:async()=>{throw Error("should not fetch");}
 });
 await assert.rejects(script.main(),/outside/);
});
test("archive preserves an existing prediction without fetching or overwriting",async()=>{
 let writes=0;
 const script=load("scripts/archive-daily-review.cjs",{"node:fs":{existsSync:()=>true,readFileSync:()=>JSON.stringify([{date:"2026-11-02",prediction:"neutral"}]),writeFileSync:()=>writes++}},{
 Date:clock("2026-11-02T00:45:00Z"),
 process:{env:{CRON_SECRET:"test-only"},argv:["node","script","morning"],cwd:()=>"/fixture"},
 fetch:async()=>{throw Error("should not fetch");}
 });
 await script.main();assert.equal(writes,0);
});

test("official margin adapter converts thousand dollars to 億元 and keeps shorts in 張",()=>{
 const {parseTwseMargin}=load("lib/twse-margin.ts");
 const payload={stat:"OK",date:"20261030",tables:[{fields:["項目","買進","賣出","現金(券)償還","前日餘額","今日餘額"],data:[
 ["融資金額(仟元)","0","0","0","10,000,000","10,100,000"],
 ["融券(交易單位)","0","0","0","500","520"]
 ]}]};
 const result=parseTwseMargin(payload,"2026-10-30");
 assert.equal(result.financingBalance,101);assert.equal(result.financingChange,1);assert.equal(result.shortBalance,520);assert.equal(result.shortChange,20);
 assert.equal(parseTwseMargin(payload,"2026-10-29"),null);
 payload.tables[0].data[0][0]="融資(交易單位)";
 assert.equal(parseTwseMargin(payload,"2026-10-30"),null);
});
test("positioning endpoint rejects an old but numerically valid institutional snapshot",async()=>{
 const route=load("app/api/market/taiwan-positioning/route.ts",{
  "next/server":response,
  "../../../../lib/histock-three":{fetchHiStockThree:async()=>({date:"2026-10-29",foreignYi:1,trustYi:1,dealerYi:1,totalYi:3})},
  "../../../../lib/trading-calendar":{taiwanCalendar:async()=>({date:"2026-11-02",referenceDate:"2026-10-30"})}
 });
 assert.equal((await route.GET()).status,503);
});

test("archive rejects a source response that completes after the capture deadline",async()=>{
 const RealDate=Date;let calls=0,writes=0;
 class SlowClock extends RealDate{constructor(...args){super(...(args.length?args:[calls++===0?"2026-11-02T00:45:00Z":"2026-11-02T01:01:00Z"]));}}
 const script=load("scripts/archive-daily-review.cjs",{"node:fs":{existsSync:()=>false,writeFileSync:()=>writes++,mkdirSync:()=>{}}},{
 Date:SlowClock,process:{env:{CRON_SECRET:"test-only"},argv:["node","script","morning"],cwd:()=>"/fixture"},
 fetch:async()=>({ok:true,json:async()=>({status:"ok",reportDate:"2026-11-02",modelVersion:"market-integrity-v2",captureStartedAt:"2026-11-02T00:45:00Z",sections:[]})})
 });
 await assert.rejects(script.main(),/late/);assert.equal(writes,0);
});
