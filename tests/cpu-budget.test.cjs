const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,response}=require('./load-ts.cjs');
test('response cache deduplicates concurrent work, clones bodies, expires and isolates keys',async()=>{
 let now=0,calls=0;class Clock extends Date{static now(){return now;}}
 const {cachedResponse}=load('lib/response-cache.ts',{}, {Date:Clock});
 const task=async()=>{calls++;return Response.json({calls});};
 const [a,b]=await Promise.all([cachedResponse('a',100,task),cachedResponse('a',100,task)]);
 assert.deepEqual(await a.json(),{calls:1});assert.deepEqual(await b.json(),{calls:1});
 now=99;assert.deepEqual(await (await cachedResponse('a',100,task)).json(),{calls:1});
 now=100;await cachedResponse('a',100,task);assert.equal(calls,2);
 await cachedResponse('b',100,task);assert.equal(calls,3);
});
test('errors cool down briefly and never serve expired good data',async()=>{
 let now=0,calls=0;class Clock extends Date{static now(){return now;}}
 const {cachedResponse}=load('lib/response-cache.ts',{}, {Date:Clock});
 const task=async()=>{calls++;return Response.json({}, {status:calls===1?200:503});};
 await cachedResponse('a',100,task);now=100;
 assert.equal((await cachedResponse('a',100,task)).status,503);
 now=15099;await cachedResponse('a',100,task);assert.equal(calls,2);
 now=15100;await cachedResponse('a',100,task);assert.equal(calls,3);
});
test('poll failures back off including focus events, then recover',async()=>{
 let now=0,tick,calls=0,focus;class Clock extends Date{static now(){return now;}}
 const doc={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const win={addEventListener:(name,fn)=>{if(name==='focus')focus=fn;},removeEventListener(){}};
 const {pollVisible}=load('lib/live-polling.ts',{}, {Date:Clock,document:doc,window:win,setInterval:fn=>(tick=fn,1),clearInterval(){}});
 const stop=pollVisible(async()=>{calls++;return calls>1;},10000);
 await new Promise(setImmediate);now=10000;tick();focus();assert.equal(calls,1);
 now=20000;tick();await new Promise(setImmediate);assert.equal(calls,2);
 now=30000;tick();assert.equal(calls,3);stop();
});
test('monthly refit reuse preserves recorded baseline and shares per-date calculation',async()=>{
 const timestamp=Array.from({length:1000},(_,i)=>Date.UTC(2022,0,3+i)/1000);
 const close=timestamp.map((_,i)=>10000+i*2+Math.sin(i/23)*1000);let calls=0;
 const {backtestedAllocation}=load('lib/backtested-allocation.ts',{}, {fetch:async()=>{calls++;return {ok:true,json:async()=>({chart:{result:[{timestamp,indicators:{quote:[{close}]}}]}})};}});
 const [a,b]=await Promise.all([backtestedAllocation('2024-09-28'),backtestedAllocation('2024-09-28')]);
 assert.equal(calls,1);assert.equal(a,b);assert.equal(a.allocation,90);
 assert.equal(a.annualReturn,22.520449921147346);assert.equal(a.maxDrawdown,0.926693786671573);
 await backtestedAllocation('2024-09-27');assert.equal(calls,2);
});
