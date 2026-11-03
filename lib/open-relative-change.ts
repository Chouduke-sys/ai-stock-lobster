export type OpenQuote={price:number;time:string;instrument:string;contract?:string|null;source?:string};
export type OpeningSample={time:string;session:string;open?:number|null};
function localParts(raw:string){
 const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)?raw.replace(" ","T")+":00+08:00":raw;
 // Do not let a host's local timezone decide which trading session a quote belongs to.
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(iso))return null;
 const stamp=Date.parse(iso);if(!Number.isFinite(stamp))return null;
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(stamp));
 const part=(key:string)=>parts.find(p=>p.type===key)?.value??"";
 const date=part("year")+"-"+part("month")+"-"+part("day"),minute=Number(part("hour"))*60+Number(part("minute"));
 return {date,minute,stamp};
}
export function tradingSession(time:string,kind:"cash"|"night"){
 const p=localParts(time);if(!p)return null;
 if(kind==="cash")return p.minute>=540&&p.minute<=810?p.date:null;
 if(p.minute>=900)return p.date;
 if(p.minute<300)return new Date(Date.parse(p.date+"T00:00:00Z")-86400000).toISOString().slice(0,10);
 return null;
}
export function calculateOpenChange(latest:OpenQuote|null,opening:OpenQuote|null,kind:"cash"|"night"){
 if(!latest||!opening||![latest.price,opening.price].every(n=>Number.isFinite(n)&&n>0)||latest.instrument!==opening.instrument||(latest.contract??null)!==(opening.contract??null))return null;
 const q=localParts(latest.time),o=localParts(opening.time),session=tradingSession(latest.time,kind);
 if(!q||!o||!session||tradingSession(opening.time,kind)!==session||o.minute!==(kind==="cash"?540:900)||q.stamp<o.stamp)return null;
 const change=latest.price-opening.price;
 return {change,changePercent:change/opening.price*100,openingPrice:opening.price,openingTime:opening.time,source:opening.source??"已驗證開盤基準",session};
}
export function openingFromMinutes(points:OpeningSample[],latest:OpenQuote,kind:"cash"|"night",source:string):OpenQuote|null{
 const session=tradingSession(latest.time,kind);if(!session)return null;
 // A later first observation or the first minute's CLOSE is not the opening price.
 const matches=points.filter(p=>p.session===session&&localParts(p.time)?.minute===(kind==="cash"?540:900)&&typeof p.open==="number"&&Number.isFinite(p.open)&&p.open>0);
 if(!matches.length||new Set(matches.map(p=>p.open)).size!==1)return null;
 const point=matches[0];
 return {price:point.open!,time:point.time,instrument:latest.instrument,contract:latest.contract,source};
}
