// Synthetic fixtures only. These values are never written to production archives.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {load,response,clock}=require("./load-ts.cjs");
function liveRoute(overrides={},globals={}){
 return load("app/api/market/morning-brief/route.ts",{
  "next/server":response,"next-auth":{getServerSession:async()=>({user:{email:"test@example.invalid"}})},
  "../../../../lib/auth":{authOptions:{}},
  "../../../../lib/trading-calendar":{taiwanCalendar:async()=>({date:"2026-11-02",referenceDate:"2026-10-30",latestCompletedDate:"2026-11-02",isTradingDay:true})},
  "../../../../lib/yahoo-quote":{getQuote:async(label,symbol)=>({label,symbol,value:null,changePct:null,time:null})},
  "../../../../lib/index-technical":{getIndexTechnical:async date=>({valid:false,sentiment:"neutral",body:"missing",verdict:"missing",date})},
  "../../../../lib/backtested-allocation":{backtestedAllocation:async()=>({allocation:null})},
  "../../../../lib/policy-news-analysis":{getPolicySignals:async()=>({items:[],score:null})},
  "../../../../lib/histock-three":{fetchHiStockThree:async()=>null},
  "../../../../lib/morning-snapshot":{loadMorningSnapshot:async()=>{throw Error("live must not read frozen archive");}},
  ...overrides
 },{Date:clock("2026-11-02T06:00:00Z"),process:{env:{CRON_SECRET:"test-only"}},
 fetch:async()=>({ok:false,json:async()=>[],text:async()=>""}),...globals});
}
test("live analysis refreshes after the capture deadline without requiring a frozen report",async()=>{
 const route=liveRoute();
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live"));
 assert.equal(result.status,200);assert.equal(result.body.view,"live");
 assert.equal(result.body.referenceDate,"2026-11-02");assert.equal(result.body.reportKind,"持續更新分析");
 assert.equal(result.body.sections[8].title,"最新分析小總結");
 assert.equal(result.body.recommendedAllocation,null);
 assert.equal(result.body.sections[8].available,false);
});
test("view=live cannot bypass the capture deadline when capture=1 is supplied",async()=>{
 const route=liveRoute();
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live&capture=1",{headers:{Authorization:"Bearer test-only"}}));
 assert.equal(result.status,409);
});
test("live analysis remains a member endpoint",async()=>{
 const route=liveRoute({"next-auth":{getServerSession:async()=>null}});
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live"));
 assert.equal(result.status,401);
});
test("live analysis can update global inputs on a scheduled Taiwan holiday",async()=>{
 const route=liveRoute({"../../../../lib/trading-calendar":{taiwanCalendar:async()=>({date:"2026-11-02",referenceDate:"2026-10-30",latestCompletedDate:"2026-10-30",isTradingDay:false})}});
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live"));
 assert.equal(result.status,200);assert.equal(result.body.referenceDate,"2026-10-30");assert.ok(result.body.sections[8].body.includes("今日休市"));
});
test("calendar exposes today's completed session only after cash close",async()=>{
 const calendar=load("lib/trading-calendar.ts",{}, {fetch:async url=>({ok:true,json:async()=>url.includes("holidaySchedule")?[{Date:"1150101",Name:"holiday"}]:{stat:"OK",data:[["115/10/30","","","",108],["115/11/02","","","",110]]}})});
 assert.equal((await calendar.taiwanCalendar(new Date("2026-11-02T04:00:00Z"))).latestCompletedDate,"2026-10-30");
 const after=await calendar.taiwanCalendar(new Date("2026-11-02T06:00:00Z"));
 assert.equal(after.latestCompletedDate,"2026-11-02");assert.equal(after.referenceDate,"2026-10-30");
});
test("VIX endpoint uses dated reference rather than chart-range metadata",async()=>{
 const route=load("app/api/market/vix/route.ts",{"next/server":response,
 "../../../../lib/yahoo-quote":{getQuote:async()=>({value:20,referencePrice:25,referenceDate:"2026-10-29",time:"2026-10-30T20:00:00Z",source:"fixture"})}});
 const result=await route.GET();assert.equal(result.body.change,-5);assert.equal(result.body.referenceDate,"2026-10-29");
});
test("US futures endpoint shows current quote even when five-minute chart lags",async()=>{
 const route=load("app/api/market/us-futures/route.ts",{"next/server":response,
 "../../../../lib/yahoo-quote":{getQuote:async(label,symbol)=>({symbol,value:symbol==="ES=F"?110:null,referencePrice:108,referenceDate:"2026-10-30",time:"2026-11-02T06:00:00Z"})}},
 {fetch:async()=>({ok:true,json:async()=>({chart:{result:[{timestamp:[Date.parse("2026-11-02T05:55:00Z")/1000],indicators:{quote:[{close:[104]}]}}]}})})});
 const result=await route.GET();assert.equal(result.body.price,110);assert.equal(result.body.points[0].value,104);assert.equal(result.body.change,2);
});
function target(){const listeners=new Map();return {listeners,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),emit:key=>listeners.get(key)?.()};}
test("visible polling avoids overlap, resumes immediately and stops cleanly",async()=>{
 const doc={...target(),visibilityState:"visible"},win=target();let tick,cleared=false,calls=0,release;
 const polling=load("lib/live-polling.ts",{}, {document:doc,window:win,setInterval:fn=>(tick=fn,1),clearInterval:()=>cleared=true});
 const stop=polling.pollVisible(()=>{calls++;return new Promise(resolve=>release=resolve);},1000);
 assert.equal(calls,1);tick();win.emit("focus");assert.equal(calls,1);
 release();await new Promise(setImmediate);
 doc.visibilityState="hidden";doc.emit("visibilitychange");tick();assert.equal(calls,1);
 doc.visibilityState="visible";doc.emit("visibilitychange");assert.equal(calls,2);
 release();await new Promise(setImmediate);
 win.emit("online");assert.equal(calls,3);
 stop();release();await Promise.resolve();tick();assert.equal(calls,3);
 assert.equal(cleared,true);assert.equal(doc.listeners.size,0);assert.equal(win.listeners.size,0);
});
test("closed-session polling slows down while focus still refreshes immediately",async()=>{
 const doc={...target(),visibilityState:"visible"},win=target();let tick,calls=0,now=0;
 class TestClock extends Date{static now(){return now;}}
 const polling=load("lib/live-polling.ts",{}, {Date:TestClock,document:doc,window:win,setInterval:fn=>(tick=fn,1),clearInterval:()=>{}});
 const stop=polling.pollVisible(()=>{calls++;},()=>30000);
 await Promise.resolve();now=1000;tick();assert.equal(calls,1);
 win.emit("focus");assert.equal(calls,2);await Promise.resolve();
 now=32000;tick();assert.equal(calls,3);stop();
});

test("live view retains the previous published margin until new-session data arrives",async()=>{
 const payload={stat:"OK",date:"20261030",tables:[{fields:["項目","前日餘額","今日餘額"],data:[["融資金額(仟元)","10000000","10100000"],["融券(交易單位)","500","520"]]}]};
 const route=liveRoute({}, {fetch:async url=>({ok:String(url).includes("MI_MARGN")&&String(url).includes("date=20261030"),json:async()=>payload,text:async()=>""})});
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live"));
 assert.equal(result.status,200);assert.equal(result.body.inputs.margin.date,"2026-10-30");
 assert.equal(result.body.inputs.margin.financingBalance,101);assert.equal(result.body.sections[2].dataDate,"2026-10-30");
});
test("a newer official institutional publication supersedes an older third-party snapshot",async()=>{
 const route=liveRoute({"../../../../lib/histock-three":{fetchHiStockThree:async()=>({date:"2026-10-30",foreignYi:-1,trustYi:-1,dealerYi:0,totalYi:-2})}}, {
 fetch:async url=>({ok:String(url).includes("BFI82U")&&String(url).includes("date=20261102"),
 json:async()=>({stat:"OK",date:"20261102",data:[["外資",0,0,100000000],["投信",0,0,100000000]]}),text:async()=>""})
 });
 const result=await route.GET(new Request("https://site.invalid/api/market/morning-brief?view=live"));
 assert.equal(result.status,200);assert.equal(result.body.inputs.institutional.date,"2026-11-02");
 assert.equal(result.body.inputs.institutional.foreign.value,100000000);assert.equal(result.body.sections[1].dataDate,"2026-11-02");
});

test("global-market outage is explicit so the UI can retain its dated last good result",async()=>{
 const route=load("app/api/market/daily-analysis/route.ts",{"next/server":response,
 "../../../../lib/yahoo-quote":{getQuote:async()=>({value:null,changePct:null})}});
 const result=await route.GET();assert.equal(result.status,503);assert.equal(result.body.status,"unavailable");
});
