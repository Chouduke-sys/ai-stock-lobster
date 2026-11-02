const fs=require("node:fs");
const path=require("node:path");
const {createHash}=require("node:crypto");
const base=process.env.SITE_URL||"https://ai-stock-lobster.vercel.app";
const secret=process.env.CRON_SECRET;
const mode=process.argv[2];
const localDate=now=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
const minute=now=>{const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);return Number(p.find(x=>x.type==="hour").value)*60+Number(p.find(x=>x.type==="minute").value);};
const inWindow=now=>minute(now)>=510&&minute(now)<540;
const digest=brief=>createHash("sha256").update(JSON.stringify(brief)).digest("hex");
async function main(){
 const now=new Date(),day=localDate(now);
 const archivePath=path.join(process.cwd(),"data","daily-review.json");
 const archive=fs.existsSync(archivePath)?JSON.parse(fs.readFileSync(archivePath,"utf8")):[];
 if(!Array.isArray(archive))throw Error("Archive malformed");
 const get=async(url,headers={})=>{const r=await fetch(base+url,{headers,signal:AbortSignal.timeout(120000)});const body=await r.json();if(!r.ok)throw Error(url+" HTTP "+r.status+" "+(body.error||""));return body;};
 if(mode==="morning"){
  if(!secret)throw Error("CRON_SECRET is required");
  if(!inWindow(now))throw Error("Refuse capture outside 08:30–08:59 Asia/Taipei");
  if(archive.some(x=>x.date===day)){console.log("Existing prediction remains immutable for "+day);return;}
  const brief=await get("/api/market/morning-brief?capture=1",{Authorization:"Bearer "+secret});
  const finished=new Date(),started=new Date(brief.captureStartedAt);
  if(brief.status!=="ok"||brief.reportDate!==day||brief.modelVersion!=="market-integrity-v2"||
    !Number.isFinite(started.getTime())||!inWindow(started)||localDate(started)!==day||
    !inWindow(finished)||localDate(finished)!==day)throw Error("Invalid or late morning capture");
  const summary=brief.sections?.find(x=>x.title==="今日盤前小總結");
  if(!summary)throw Error("Missing summary");
  archive.push({date:day,createdAt:finished.toISOString(),prediction:summary.sentiment,predictionLabel:summary.verdict,predictionAvailable:summary.available===true,
   signals:brief.sections.slice(0,8).map(x=>({title:x.title,sentiment:x.sentiment,available:x.available,dataDate:x.dataDate})),
   snapshot:{version:2,reportDate:day,capturedAt:finished.toISOString(),modelVersion:brief.modelVersion,sha256:digest(brief)},
   brief,outcome:null});
 }else if(mode==="close"){
  const record=archive.find(x=>x.date===day);
  if(!record){console.log("No morning snapshot for "+day);return;}
  if(record.outcome){console.log("Existing verified result remains unchanged for "+day);return;}
  if(record.snapshot?.version!==2||digest(record.brief)!==record.snapshot.sha256)throw Error("Legacy/unverified prediction is excluded");
  const close=await get("/api/market/taiex/close");
  if(close.date!==day||!Number.isFinite(close.change)||!Number.isFinite(close.value)||close.value-close.change<=0)throw Error("Invalid closing data/date");
  const pct=close.change/(close.value-close.change)*100;
  const actual=pct>0.15?"bullish":pct< -0.15?"bearish":"neutral";
  record.outcome={date:day,indexClose:close.value,changePct:pct,actual,correct:record.predictionAvailable===true?record.prediction===actual:null,verifiedAt:new Date().toISOString(),source:close.dataSource};
 }else throw Error("Expected morning or close");
 archive.sort((a,b)=>a.date.localeCompare(b.date));
 fs.mkdirSync(path.dirname(archivePath),{recursive:true});
 fs.writeFileSync(archivePath,JSON.stringify(archive,null,2)+"\n");
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main,inWindow,digest};
