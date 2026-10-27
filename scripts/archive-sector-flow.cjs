const fs=require("node:fs");
const path=require("node:path");
const url=process.env.SECTOR_FLOW_URL||"https://ai-stock-lobster.vercel.app/api/market/ai-flow";
const archivePath=path.join(process.cwd(),"data","sector-flow-history.json");
async function main(){
 const response=await fetch(url,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error("Sector API HTTP "+response.status);
 const payload=await response.json();
 if(payload.status!=="ok"||!Array.isArray(payload.groups)||payload.groups.length<5)throw Error("Sector groups unavailable");
 const date=payload.asOf;
 if(typeof date!=="string"||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(date))throw Error("Invalid data date");
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const lag=Math.floor((Date.parse(today+"T00:00:00Z")-Date.parse(date+"T00:00:00Z"))/86400000);
 if(lag<0||lag>5)throw Error("Historical data date stale or in future: "+date);
 const groups=payload.groups.map(g=>({
  name:g.name,
  turnover:g.turnover,
  weeklyDelta:g.weeklyDelta,
  weeklyChange:g.weeklyChange,
  turnoverShare:g.turnoverShare,
  shareDelta:g.shareDelta,
  medianPriceMove:g.medianPriceMove,
  risingSessions:g.risingSessions,
  radarStatus:g.radarStatus,
  historyDays:g.historyDays,
  historyDate:g.historyDate,
  stockCount:Array.isArray(g.stocks)?g.stocks.length:0
 })).filter(g=>typeof g.name==="string"&&Number.isFinite(g.turnover)&&g.turnover>0);
 if(groups.length<5)throw Error("Not enough valid industry records");
 fs.mkdirSync(path.dirname(archivePath),{recursive:true});
 const existing=fs.existsSync(archivePath)?JSON.parse(fs.readFileSync(archivePath,"utf8")):[];
 if(!Array.isArray(existing))throw Error("Archive invalid");
 const record={date,recordedAt:new Date().toISOString(),source:payload.source||"TWSE",historicalSessions:payload.historicalSessions,groups};
 const index=existing.findIndex(x=>x.date===date);
 // Replace today's snapshot as official closing data becomes available; never duplicate the same date.
 if(index>=0){
  if(JSON.stringify(existing[index].groups)===JSON.stringify(groups)){console.log("No changes for "+date);return;}
  existing[index]=record;
 }else existing.push(record);
 existing.sort((a,b)=>a.date.localeCompare(b.date));
 fs.writeFileSync(archivePath,JSON.stringify(existing.slice(-500),null,2)+"\n");
 console.log("Recorded "+date+": "+groups.length+" industries");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
