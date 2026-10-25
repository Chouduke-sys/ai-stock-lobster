const fs=require("node:fs");
const path=require("node:path");
const base=process.env.SITE_URL||"https://ai-stock-lobster.vercel.app";
const secret=process.env.CRON_SECRET;
if(!secret)throw Error("CRON_SECRET is required");
const now=new Date();
const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
const mode=process.argv[2];
const archivePath=path.join(process.cwd(),"data","daily-review.json");
fs.mkdirSync(path.dirname(archivePath),{recursive:true});
const archive=fs.existsSync(archivePath)?JSON.parse(fs.readFileSync(archivePath,"utf8")):[];
const get=async(url,headers={})=>{const r=await fetch(base+url,{headers});if(!r.ok)throw Error(url+" HTTP "+r.status);return r.json();};
if(mode==="morning"){
 const brief=await get("/api/market/morning-brief",{Authorization:"Bearer "+secret});
 if(brief.status!=="ok"||brief.reportDate!==day)throw Error("Invalid morning brief date");
 const existing=archive.find(x=>x.date===day);
 if(!existing){
  archive.push({date:day,createdAt:now.toISOString(),prediction:brief.sections[8]?.sentiment??"neutral",predictionLabel:brief.sections[8]?.verdict??"中性",signals:brief.sections.slice(0,8).map(x=>({title:x.title,sentiment:x.sentiment})),outcome:null});
 }
}else if(mode==="close"){
 const record=archive.find(x=>x.date===day);
 if(!record){console.log("No morning snapshot for "+day);process.exit(0);}
 const close=await get("/api/market/taiex/close");
 if(close.date!==day)throw Error("Closing data is not for "+day);
 if(typeof close.change!=="number"||typeof close.value!=="number")throw Error("Missing index values");
 const previous=close.value-close.change;
 if(previous<=0)throw Error("Invalid previous close");
 const pct=close.change/previous*100;
 const actual=pct>0.15?"bullish":pct< -0.15?"bearish":"neutral";
 record.outcome={indexClose:close.value,changePct:pct,actual,correct:record.prediction===actual,verifiedAt:now.toISOString(),source:"TWSE FMTQIK"};
}else throw Error("Expected morning or close");
archive.sort((a,b)=>a.date.localeCompare(b.date));
fs.writeFileSync(archivePath,JSON.stringify(archive.slice(-400),null,2)+"\n");
console.log(mode+" saved "+day);
