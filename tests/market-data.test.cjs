const {test}=require("node:test");
const assert=require("node:assert/strict");
const {load,clock}=require("./load-ts.cjs");
const data=load("lib/market-data.ts");
test("missing, decorated and invalid numeric values never become zero",()=>{
 for(const value of [null,undefined,"","—","N/A","未知","12元",Infinity])assert.equal(data.strictNumber(value),null);
 assert.equal(data.strictNumber("−1,234.50"),-1234.5);
 assert.equal(data.strictNumber("0"),0);
});
test("invalid dates and ROC leap dates are validated",()=>{
 assert.equal(data.marketDate("1151030"),"2026-10-30");
 assert.equal(data.marketDate("20260230"),null);
 assert.equal(data.marketDate("20261301"),null);
});
test("daily change uses the expected dated close, not chart range metadata",()=>{
 const result=data.dailyChange(110,{date:"2026-10-30",close:108},"2026-10-30");
 assert.ok(Math.abs(result.changePercent-1.85185185)<0.00001);
 assert.equal(data.dailyChange(110,{date:"2026-10-29",close:100},"2026-10-30"),null);
});
test("completed daily bars exclude intraday/future bars and sort/deduplicate",()=>{
 const bars=data.completedCloses([{date:"2026-11-02",close:110},{date:"2026-10-30",close:108},{date:"2026-10-29",close:100},{date:"2026-10-30",close:108},{date:"2026-10-28",close:NaN}],"2026-10-30");
 assert.equal(JSON.stringify(bars),JSON.stringify([{date:"2026-10-29",close:100},{date:"2026-10-30",close:108}]));
});
test("capture is only permitted from 08:30 inclusive to 09:00 exclusive Taipei",()=>{
 assert.equal(data.captureWindow(new Date("2026-11-02T00:29:59Z")),false);
 assert.equal(data.captureWindow(new Date("2026-11-02T00:30:00Z")),true);
 assert.equal(data.captureWindow(new Date("2026-11-02T01:00:00Z")),false);
});
test("summary is excluded from counts and missing data is not neutral",()=>{
 const result=data.signalCounts([{sentiment:"bullish",available:true},{sentiment:"neutral",available:false},...Array.from({length:6},()=>({sentiment:"neutral",available:true})),{sentiment:"bullish",available:true}]);
 assert.equal(result.bullish,1);assert.equal(result.neutral,6);assert.equal(result.unavailable,1);
});
test("quote freshness rejects expired, absent and future timestamps",()=>{
 const now=Date.parse("2026-11-02T01:00:00Z");
 assert.equal(data.isQuoteFresh("2026-11-02T00:57:59Z",120000,now),false);
 assert.equal(data.isQuoteFresh(null,120000,now),false);
 assert.equal(data.isQuoteFresh("2026-11-02T02:00:00Z",120000,now),false);
});
test("snapshots verify content hashes and reject legacy/invalid dates",()=>{
 const snap=load("lib/morning-snapshot.ts");
 const brief={reportDate:"2026-11-02",modelVersion:"market-integrity-v2",sections:[{title:"今日盤前小總結",sentiment:"neutral",verdict:"中性"}]};
 const record={date:"2026-11-02",prediction:"neutral",predictionLabel:"中性",brief,snapshot:{version:2,modelVersion:brief.modelVersion,reportDate:brief.reportDate,capturedAt:"2026-11-02T00:45:00Z",sha256:snap.snapshotHash(brief)}};
 assert.equal(snap.validSnapshot(record),true);
 assert.equal(snap.validSnapshot({...record,prediction:"bullish"}),false);
 record.brief.sections.push({sentiment:"bullish"});
 assert.equal(snap.validSnapshot(record),false);
 assert.equal(snap.validSnapshot({date:record.date}),false);
 assert.equal(snap.validSnapshot({...record,snapshot:{...record.snapshot,capturedAt:"invalid"}}),false);
});
test("metrics use last N verified trading records even across calendar gaps",()=>{
 const snap=load("lib/morning-snapshot.ts"),records=[];
 let day=new Date("2026-11-02T00:00:00Z");
 for(let i=0;i<40;i++){
  do{day=new Date(day.getTime()-86400000);}while([0,6].includes(day.getUTCDay()));
  const date=day.toISOString().slice(0,10),brief={reportDate:date};
  records.push({date,prediction:"bullish",brief,snapshot:{version:2,reportDate:date,capturedAt:date+"T00:45:00Z",sha256:snap.snapshotHash(brief)},outcome:{date,actual:"bullish",correct:true,changePct:1,indexClose:100}});
 }
 records.push({date:"2026-11-02",outcome:{correct:true}});
 assert.equal(data.reviewMetrics(records,30).evaluated,30);
 assert.equal(data.reviewMetrics(records,90).evaluated,40);
 assert.equal(data.reviewMetrics(records,30).rate,100);
 records[0].outcome.date="wrong";
 assert.equal(data.validOutcome(records[0]),false);
});
test("scheduled holidays, opening-session labels and unknown years are distinguished",()=>{
 const {scheduledTradingDay}=load("lib/trading-calendar.ts");
 const rows=[{Date:"1150101",Name:"開國紀念日"},{Date:"1150102",Name:"國曆新年開始交易日"},{Date:"1151026",Name:"補假"}];
 assert.equal(scheduledTradingDay("2026-10-26",rows),false);
 assert.equal(scheduledTradingDay("2026-01-02",rows),true);
 assert.equal(scheduledTradingDay("2026-11-01",rows),false);
 assert.equal(scheduledTradingDay("2027-01-04",rows),null);
});
test("official calendar selects previous completed date, including month boundaries",async()=>{
 const calendar=load("lib/trading-calendar.ts",{}, {fetch:async url=>({ok:true,json:async()=>url.includes("holidaySchedule")?[{Date:"1150101",Name:"假日"}]:{stat:"OK",data:[["115/11/02","","","",110],["115/10/30","","","",108]]}})});
 const result=await calendar.taiwanCalendar(new Date("2026-11-02T00:45:00Z"));
 assert.equal(result.referenceDate,"2026-10-30");assert.equal(result.referenceClose.close,108);
});
test("source health rejects stale, undated and unknown-schema responses",()=>{
 const {sourceQuality}=load("lib/source-validation.ts");
 assert.equal(sourceQuality([{Date:"20261029",TAIEX:"100"}],["TAIEX"],1,"2026-10-30","2026-11-02").ok,false);
 assert.equal(sourceQuality([{TAIEX:"100"}],["TAIEX"],1,"2026-10-30","2026-11-02").ok,false);
 assert.equal(sourceQuality([{Date:"20261030",TAIEX:"100"}],["TAIEX"],1,"2026-10-30","2026-11-02").ok,true);
});
