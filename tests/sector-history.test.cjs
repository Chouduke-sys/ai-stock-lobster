const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,response,clock}=require('./load-ts.cjs');
const {parseMarketHistory,summarizeSectors,historyUrl}=load('lib/sector-history.ts');
const {sectors}=load('lib/sector-universe.ts');

// Synthetic market tables; production history is tested separately below.
function fixture(market,date='20261030'){
 const fields=market==='twse'?['證券代號','證券名稱','成交金額','收盤價','成交股數']:['代號','名稱','成交金額(元)','收盤','成交股數'];
 return {stat:'OK',date,tables:[{fields:['指數','收盤指數'],data:[['指數','100']]},{fields,data:Array.from({length:100},(_,i)=>[String(2300+i),'測試'+i,'1,000','10','100'])}]};
}
test('modern TWSE and TPEx tables identify money, not shares, and require matching dates',()=>{
 for(const market of ['twse','tpex']){
  const result=parseMarketHistory(fixture(market),market,'2026-10-30');
  assert.equal(result.rows.length,100);assert.equal(result.total,100000);assert.equal(result.rows[0].volume,100);
  assert.equal(parseMarketHistory(fixture(market),market,'2026-11-02'),null);
 }
 const f=fixture('twse');f.tables[1].date='115/10/29';assert.equal(parseMarketHistory(f,'twse','2026-10-30'),null);
});
test('legacy numbered tables remain supported; malformed data and conflicting duplicate rows fail closed',()=>{
 const f=fixture('twse'),table=f.tables[1];
 assert(parseMarketHistory({stat:'OK',date:f.date,fields9:table.fields,data9:table.data},'twse','2026-10-30'));
 table.data.push(['2300','測試0','2,000','10','200']);
 assert.equal(parseMarketHistory(f,'twse','2026-10-30'),null);
 assert.equal(parseMarketHistory({stat:'OK',date:f.date,tables:[]},'twse','2026-10-30'),null);
});
function day(date,value=100,missing=false){
 return {date,markets:['twse','tpex'].map((market,i)=>({date,market,source:historyUrl(market,date),fetchedAt:date+'T10:00:00Z',rowCount:200,total:10000,
 rows:missing&&i===1?[]:[{symbol:i?'6274':'2383',name:'測試',value,close:10,volume:100}]}))};
}
const basket=[{name:'測試族群',chain:'測試',stocks:['2383','6274']}];
const dates=['2026-11-02','2026-10-30','2026-10-29','2026-10-28','2026-10-27','2026-10-22'];
test('mixed listed/OTC baskets compare exact same members across five prior days and exclude current from mean',()=>{
 const days=dates.map((d,i)=>day(d,i===0?200:100));
 const [g]=summarizeSectors(days,basket,'2026-11-02');
 assert.equal(g.priorAverage,200);assert.equal(g.turnover,400);assert.equal(g.weeklyDelta,200);assert.equal(g.weeklyChange,100);
 assert.equal(g.turnoverShare,2);assert.equal(g.historicalQuality,'verified');assert.equal(g.comparisonDates.length,5);
 assert.equal(g.historySeries[0].date,'2026-10-22');
});
test('missing OTC member, missing market and insufficient prior sessions cannot manufacture a trend',()=>{
 const days=dates.map(d=>day(d));days[2]=day(dates[2],100,true);
 const [g]=summarizeSectors(days,basket,'2026-11-02');assert.equal(g.weeklyDelta,null);assert.equal(g.radarStatus,'insufficient');
 const newest=day('2026-11-03');newest.markets.pop();
 const [prior]=summarizeSectors([newest,...dates.map(d=>day(d))],basket,'2026-11-03');assert.equal(prior.historyDate,'2026-11-02');
 const [short]=summarizeSectors(dates.slice(0,3).map(d=>day(d)),basket,'2026-11-02');assert.equal(short.weeklyDelta,null);
});
test('future days are excluded and zero trading amount is an observation rather than missing data',()=>{
 const days=dates.map(d=>day(d,0));days.unshift(day('2026-11-03',200));
 const [g]=summarizeSectors(days,[{...basket[0],stocks:['2383','6274']}],'2026-11-02');
 // Zero-turnover baskets are deliberately absent from rankings.
 assert.equal(g,undefined);
 const f=fixture('twse');f.tables[1].data[0]=['2300','停牌','0','--','0'];
 assert.equal(parseMarketHistory(f,'twse','2026-10-30').rows[0].value,0);
});
test('real backfill covers all 14 research baskets, both markets and all 63 members',()=>{
 const archive=require('../data/sector-market-history.json');
 const latest=archive.days.map(d=>d.date).sort().at(-1);
 const groups=summarizeSectors(archive.days,sectors,latest);
 assert(archive.days.length>=30);assert.equal(groups.length,14);
 assert.equal(new Set(sectors.flatMap(g=>g.stocks)).size,63);
 assert(groups.every(g=>g.historicalQuality==='verified'&&g.observedStocks===g.expectedStocks&&g.comparisonDates.length===5));
 assert(groups.every(g=>g.historySeries.length===30&&Number.isFinite(g.weeklyDelta)));
});
test('official archive keeps history available when every live provider is unreachable',async()=>{
 const provider=load('lib/sector-history-provider.ts',{}, {fetch:async()=>{throw Error('offline');}});
 const latest=require('../data/sector-market-history.json').days.map(d=>d.date).sort().at(-1);
 const history=await provider.sectorHistory(latest);
 assert.equal(summarizeSectors(history,sectors,latest).filter(g=>g.historicalQuality==='verified').length,14);
});
test('sector API stays available from history when live turnover feeds and calendar fail',async()=>{
 const archive=require('../data/sector-market-history.json');
 const latest=archive.days.map(d=>d.date).sort().at(-1);
 const route=load('app/api/market/ai-flow/route.ts',{'next/server':response,
  '../../../../lib/trading-calendar':{taiwanCalendar:async()=>{throw Error('offline');}},
  '../../../../lib/sector-history-provider':{sectorHistory:async()=>archive.days},
 },{Date:clock(latest+'T10:00:00Z'),fetch:async()=>{throw Error('offline');}});
 const r=await route.GET();assert.equal(r.status,200);assert.equal(r.body.historyStatus,'available');
 assert.equal(r.body.sectorAsOf,latest);assert.equal(r.body.groups.length,14);assert.equal(r.body.volumeLeaders.length,0);
});
