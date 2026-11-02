/** Pure validation shared by adapters, snapshots and regression tests. */
export function taipeiDate(now = new Date()): string {
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
export function taipeiMinute(now = new Date()): number {
 const parts = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
 return Number(parts.find(p=>p.type==="hour")?.value)*60+Number(parts.find(p=>p.type==="minute")?.value);
}
export function marketDate(raw: unknown): string|null {
 const text = String(raw??"").trim();
 const m = text.match(/^(\d{3}|\d{4})[\/-]?(\d{2})[\/-]?(\d{2})$/);
 if(!m)return null;
 const year = Number(m[1])+(m[1].length===3?1911:0);
 const date = year+"-"+m[2]+"-"+m[3];
 const stamp=Date.parse(date+"T00:00:00Z");
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?date:null;
}
export function strictNumber(raw: unknown): number|null {
 if(typeof raw==="number")return Number.isFinite(raw)?raw:null;
 const text=String(raw??"").trim().replace(/,/g,"").replace(/[＋]/g,"+").replace(/[－−]/g,"-");
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(text))return null;
 const n=Number(text);return Number.isFinite(n)?n:null;
}
export type DatedClose={date:string;close:number};
export function completedCloses(bars:DatedClose[],lastCompletedDate:string):DatedClose[]{
 const unique=new Map<string,DatedClose>();
 for(const bar of bars)if(marketDate(bar.date)===bar.date&&bar.date<=lastCompletedDate&&Number.isFinite(bar.close)&&bar.close>0)unique.set(bar.date,bar);
 return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function dailyChange(value:number,previous:DatedClose|null,expectedDate:string){
 if(!Number.isFinite(value)||value<=0||!previous||previous.date!==expectedDate||!Number.isFinite(previous.close)||previous.close<=0)return null;
 return {change:value-previous.close,changePercent:(value/previous.close-1)*100,referenceDate:previous.date,referencePrice:previous.close};
}
export function captureWindow(now=new Date()){
 const minute=taipeiMinute(now);
 return minute>=510&&minute<540;
}
export function isQuoteFresh(time:string|null,maxAgeMs:number,now=Date.now()){
 if(!time)return false;
 const age=now-Date.parse(time);
 return Number.isFinite(age)&&age>=-300000&&age<=maxAgeMs;
}
export function signalCounts(sections:{sentiment:string;available?:boolean}[]){
 const inputs=sections.slice(0,8);
 return {
  bullish:inputs.filter(x=>x.available!==false&&x.sentiment==="bullish").length,
  bearish:inputs.filter(x=>x.available!==false&&x.sentiment==="bearish").length,
  neutral:inputs.filter(x=>x.available!==false&&x.sentiment==="neutral").length,
  unavailable:inputs.filter(x=>x.available===false).length
 };
}
export function verifiedSnapshot(record:any){
 const s=record?.snapshot;
 return Boolean(record?.date&&s?.version===2&&s?.reportDate===record.date&&
 s?.capturedAt&&Number.isFinite(Date.parse(s.capturedAt))&&taipeiDate(new Date(s.capturedAt))===record.date&&captureWindow(new Date(s.capturedAt))&&
 typeof s?.sha256==="string"&&record?.brief?.reportDate===record.date);
}
export function validOutcome(record:any){
 const o=record?.outcome;
 if(record.predictionAvailable===false||!o||o.date!==record.date||!Number.isFinite(o.changePct)||!Number.isFinite(o.indexClose)||o.indexClose<=0)return false;
 const actual=o.changePct>0.15?"bullish":o.changePct< -0.15?"bearish":"neutral";
 return o.actual===actual&&o.correct===(record.prediction===actual);
}
export function reviewMetrics(records:any[],count:number){
 const rows=records.filter(x=>verifiedSnapshot(x)&&validOutcome(x))
  .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,count);
 const correct=rows.filter(x=>x.outcome.correct).length;
 return {evaluated:rows.length,correct,rate:rows.length?Math.round(correct/rows.length*1000)/10:null,
 from:rows.at(-1)?.date??null,to:rows[0]?.date??null,windowTradingDays:count};
}
