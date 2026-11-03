const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./load-ts.cjs');
const {assessAllocation}=load('lib/market-risk-score.ts');
const signal=(name,weight,direction)=>({name,weight,direction});
test('verified coverage can produce an explicit rule-based level when no backtest is available',()=>{
 const r=assessAllocation([signal('positive',60,'bullish'),signal('negative',40,'bearish')],null);
 assert.equal(r.score,60);assert.equal(r.recommendedAllocation,60);assert.equal(r.mode,'risk-rules');assert(r.reason.includes('未經回測最佳化'));
});
test('missing inputs are excluded; low coverage never fabricates a percentage',()=>{
 const r=assessAllocation([signal('known',25,'bullish'),signal('missing',75,null)],80);
 assert.equal(r.coverage,25);assert.equal(r.recommendedAllocation,null);assert.equal(r.mode,'unavailable');
 assert.equal(assessAllocation([signal('missing',100,null)],null).score,null);
});
test('partial coverage caps exposure and zero backtest allocation remains zero',()=>{
 const partial=assessAllocation([signal('known',50,'bullish'),signal('missing',50,null)],null);
 assert.equal(partial.recommendedAllocation,50);
 const full=[signal('known',100,'bullish')];
 assert.equal(assessAllocation(full,0).recommendedAllocation,0);
 assert.equal(assessAllocation(full,100).recommendedAllocation,90);
 assert.equal(assessAllocation(full,NaN).mode,'risk-rules');
});
test('risk rules decrease exposure for bearish versus neutral or bullish signals',()=>{
 assert.equal(assessAllocation([signal('all',100,'bearish')],null).recommendedAllocation,20);
 assert.equal(assessAllocation([signal('all',100,'neutral')],null).recommendedAllocation,45);
 assert.equal(assessAllocation([signal('all',100,'bullish')],null).recommendedAllocation,75);
});
