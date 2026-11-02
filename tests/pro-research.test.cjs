const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,response,clock}=require('./load-ts.cjs');
const {stockAnalysis,parseWatchlist,compareSectors,officialStockHistory,researchText}=load('lib/pro-research.ts');
const {sectors}=load('lib/sector-universe.ts');
function bars(count,change=1){return Array.from({length:count},(_,i)=>({date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),close:100+i*change,volume:1000}));}
test('daily indicators exclude future bars, seed Wilder RSI and preserve missing long windows',()=>{
 const r=stockAnalysis(bars(21),'2026-09-20');
 assert.equal(r.sampleDays,20);assert.equal(r.close,119);assert.equal(r.ma5,117);assert.equal(r.ma20,109.5);assert.equal(r.rsi14,100);assert.equal(r.change20,null);assert.equal(r.volumeRatio,1);
 assert.equal(stockAnalysis(bars(20,0),'2026-10-01').rsi14,50);
 assert.equal(stockAnalysis(bars(20,-1),'2026-10-01').rsi14,0);
 assert.equal(stockAnalysis(bars(8),'2026-10-01').ma20,null);
});
test('watchlist safely loads corrupt storage, caps length, rejects invalid symbols and deduplicates',()=>{
 assert.equal(parseWatchlist('{bad').length,0);
 assert.equal(parseWatchlist('[{"symbol":2330}]').length,0);
 const result=parseWatchlist(JSON.stringify([{symbol:'2330',name:'台積電',note:'a'.repeat(600)},{symbol:'2330'},{symbol:'../../private'},...Array.from({length:25},(_,i)=>({symbol:String(3000+i)}))]));
 assert.equal(result.length,20);assert.equal(result[0].note.length,500);assert.equal(result.filter(x=>x.symbol==='2330').length,1);
});
test('5/10/20 session sector comparisons use exact members and exclude current from historical mean',()=>{
 const days=require('../data/sector-market-history.json').days;
 const last=days.map(d=>d.date).sort().at(-1);
 for(const size of [5,10,20]){
  const groups=compareSectors(days,size,last);assert.equal(groups.length,14);assert(groups.every(g=>g.complete&&g.observations.length===size+1));
  const group=groups[0],average=group.observations.slice(0,-1).reduce((s,d)=>s+d.value,0)/size;
  assert.equal(group.average,average);assert.equal(group.delta,group.amount-average);
 }
 const stock=officialStockHistory(days,'6274',last);assert(stock.bars.length>=20);assert.equal(stock.name,'台燿');
 const limited=compareSectors(days.slice(0,3),5,last);assert(limited.every(g=>g.delta===null));
});
test('summary export includes provenance and never claims generated AI predictions',()=>{
 const text=researchText('測試','2330',stockAnalysis(bars(20),'2026-10-01'),'official fixture');
 assert(text.includes('official fixture'));assert(text.includes('非生成式 AI'));assert(text.includes('2026-09-20'));
});
function route(session,globals={}){
 let queries=0;
 const api=load('app/api/pro/research/route.ts',{'next/server':response,'next-auth':{getServerSession:async()=>{if(session instanceof Error)throw session;return session;}},'../../../../lib/auth':{authOptions:{}},'../../../../lib/pro-data':{proResearch:async(symbol,lookback)=>{queries++;return {symbol,lookback};}}},globals);
 return {api,count:()=>queries};
}
test('Pro data denies anonymous users before fetching and is never publicly cached',async()=>{
 const {api,count}=route(null);const r=await api.GET(new Request('https://site.test/api/pro/research?symbol=2330'));
 assert.equal(r.status,401);assert.equal(count(),0);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.headers.Vary,'Cookie');
});
test('missing authentication configuration fails closed with a useful service status',async()=>{
 const {api,count}=route(new Error('Missing secret'));
 const result=await api.GET(new Request('https://site.test/api/pro/research'));
 assert.equal(result.status,503);assert.equal(count(),0);assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('all signed-in members can preview without paid entitlement; invalid symbols/windows are rejected',async()=>{
 const {api,count}=route({user:{email:'member@example.invalid'}});
 for(const query of ['symbol=../../x','symbol=2330&window=200','symbol=23300','symbol=2330&window=0'])assert.equal((await api.GET(new Request('https://site.test/api/pro/research?'+query))).status,400);
 assert.equal(count(),0);
 const r=await api.GET(new Request('https://site.test/api/pro/research?symbol=6274&window=20'));
 assert.equal(r.status,200);assert.equal(r.body.access,'member-free-preview');assert.equal(r.body.lookback,20);assert.equal(count(),1);
});
test('Pro official data works offline, excludes today before close and supports OTC constituents',async()=>{
 const archive=require('../data/sector-market-history.json').days;
 const latest=archive.map(d=>d.date).sort().at(-1);
 const p=load('lib/pro-data.ts',{'./sector-history-provider':{sectorHistory:async()=>archive}},{fetch:async()=>{throw Error('offline');}});
 const result=await p.proResearch('6274',10,new Date(latest+'T02:00:00Z'));
 assert(result.analysis.date<latest);assert(result.sectorDate<latest);assert(result.source.includes('TWSE'));assert(result.analysis.sampleDays>=20);
});
