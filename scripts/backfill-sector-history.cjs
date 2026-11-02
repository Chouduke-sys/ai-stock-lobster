// Real official daily trade values, not close × volume estimates or browser snapshots.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(relative){
 const filename=path.resolve(relative),m=new Module(filename,module);
 m.filename=filename;m.paths=module.paths;
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
 return m.exports;
}
const {sectors}=load('lib/sector-universe.ts');
const {parseMarketHistory,historyUrl,validArchivedMarket}=load('lib/sector-history.ts');
const target='data/sector-market-history.json';
const symbols=new Set(sectors.flatMap(g=>g.stocks));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function main(){
 const saved=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{version:1,days:[]};
 const days=new Map(saved.days.filter(d=>d.markets.length===2&&d.markets.every(validArchivedMarket)).map(d=>[d.date,d]));
 const candidates=Array.from({length:65},(_,i)=>new Date(Date.parse(today+'T00:00:00Z')-i*86400000)).filter(d=>![0,6].includes(d.getUTCDay())).map(d=>d.toISOString().slice(0,10));
 let failures=0;
 // Three dates at a time: bound upstream load instead of sending every request at once.
 for(let i=0;i<candidates.length;i+=3){
  if([...days.keys()].filter(d=>d<=today).length>=30&&i>3)break;
  await Promise.all(candidates.slice(i,i+3).map(async date=>{
   if(days.has(date)&&date!==today)return;
   try{
    const markets=await Promise.all(['twse','tpex'].map(async market=>{
     const res=await fetch(historyUrl(market,date),{signal:AbortSignal.timeout(20000)});
     if(!res.ok)throw Error(market+' HTTP '+res.status);
     const parsed=parseMarketHistory(await res.json(),market,date);
     return parsed?{...parsed,rows:parsed.rows.filter(row=>symbols.has(row.symbol))}:null;
    }));
    if(markets.every(Boolean)){
     days.set(date,{date,markets});
     const found=new Set(markets.flatMap(m=>m.rows.map(r=>r.symbol)));
     console.log(date+': '+found.size+'/'+symbols.size+' constituents; TWSE '+markets[0].rowCount+', TPEx '+markets[1].rowCount);
    }else console.log(date+': no complete official session (holiday or unpublished)');
   }catch(e){failures++;console.error(date+': '+e.message);}
  }));
  const ordered=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,35);
  fs.writeFileSync(target,JSON.stringify({version:1,days:ordered})+'\n');
 }
 const latest=[...days.keys()].sort().at(-1);
 console.log('Saved '+days.size+' sessions through '+latest+'; network failures '+failures);
 if(days.size<6||!latest||Date.parse(today)-Date.parse(latest)>7*86400000)throw Error('Historical archive is incomplete or stale');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
