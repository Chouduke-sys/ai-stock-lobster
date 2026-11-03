const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,clock}=require('./load-ts.cjs');
const {calculateOpenChange,openingFromMinutes,tradingSession}=load('lib/open-relative-change.ts');
const cash={price:20200,time:'2026-11-03T10:00:00+08:00',instrument:'^TWII'};
const open={price:20000,time:'2026-11-03T09:00:00+08:00',instrument:'^TWII'};
test('local point/percent calculation uses opening price as denominator, preserving signs and zero',()=>{
 assert.equal(calculateOpenChange(cash,open,'cash').change,200);
 assert.equal(calculateOpenChange(cash,open,'cash').changePercent,1);
 assert.equal(calculateOpenChange({...cash,price:19800},open,'cash').changePercent,-1);
 assert.equal(calculateOpenChange({...cash,price:20000},open,'cash').change,0);
});
test('missing, zero, stale-session, wrong-product, timezone-less and later baselines are rejected',()=>{
 for(const invalid of [null,{...open,price:0},{...open,price:NaN},{...open,time:'2026-11-02T09:00:00+08:00'},{...open,time:'2026-11-03T09:05:00+08:00'},{...open,instrument:'TX'},{...open,time:'2026-11-03T09:00:00'}])assert.equal(calculateOpenChange(cash,invalid,'cash'),null);
});
test('night sessions retain afternoon opening across midnight and reject day-open/contract mixing',()=>{
 const q={price:20100,time:'2026-11-04T01:00:00+08:00',instrument:'TX',contract:'202611'};
 const o={price:20000,time:'2026-11-03T15:00:00+08:00',instrument:'TX',contract:'202611'};
 assert.equal(tradingSession(q.time,'night'),'2026-11-03');assert.equal(calculateOpenChange(q,o,'night').changePercent,.5);
 assert.equal(calculateOpenChange(q,{...o,contract:'202612'},'night'),null);
 assert.equal(calculateOpenChange(q,{...o,contract:null},'night'),null);
 assert.equal(calculateOpenChange(q,{...o,time:'2026-11-03T08:45:00+08:00'},'night'),null);
 assert.equal(tradingSession('2026-11-04T05:00:00+08:00','night'),null);
});
test('history uses exact opening minute OPEN, never a later tick or first-minute close',()=>{
 const points=[{time:'2026-11-03 09:00',session:'2026-11-03',value:20100,open:20000},{time:'2026-11-03 09:01',session:'2026-11-03',value:20200,open:20100}];
 const opening=openingFromMinutes(points,cash,'cash','fixture');assert.equal(opening.price,20000);
 assert.equal(openingFromMinutes(points.slice(1),cash,'cash','fixture'),null);
 assert.equal(openingFromMinutes([{...points[0],open:null}],cash,'cash','fixture'),null);
 assert.equal(openingFromMinutes([...points,{...points[0],open:19900}],cash,'cash','fixture'),null);
});
test('existing Yahoo daily response exposes same-date opening without another upstream request',async()=>{
 let requests=0;
 const t=iso=>Date.parse(iso)/1000;
 const quote=load('lib/yahoo-quote.ts',{}, {Date:clock('2026-11-03T02:00:00Z'),fetch:async()=>{requests++;return new Response(JSON.stringify({chart:{result:[{meta:{regularMarketPrice:20200,regularMarketTime:t('2026-11-03T02:00:00Z'),exchangeTimezoneName:'Asia/Taipei'},timestamp:[t('2026-11-02T01:00:00Z'),t('2026-11-03T01:00:00Z')],indicators:{quote:[{open:[19000,20000],close:[19900,20200]}]}}]}}));}});
 const result=await quote.getQuote('index','^TWII');assert.equal(requests,1);assert.equal(result.openPrice,20000);assert.equal(result.openDate,'2026-11-03');
});
