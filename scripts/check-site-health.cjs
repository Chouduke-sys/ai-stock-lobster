// Public, read-only production smoke test. Never uses credentials or invents missing market data.
const BASE=(process.env.SITE_URL||"https://ai-stock-lobster.vercel.app").replace(/\/$/,"");
const cases=[
 ["首頁","/", "html"],
 ["成交金額 Top10／產業資金熱度","/api/market/ai-flow","flow"],
 ["法人籌碼","/api/institutional?market=twse&investor=all&side=buy","institutional"],
 ["加權指數盤中","/api/market/taiex","index"],
 ["加權指數收盤","/api/market/taiex/close","close"],
 ["台指期夜盤","/api/market/taiex/night","night"],
 ["全球市場／盤前參考","/api/market/daily-analysis","global"],
 ["VIX","/api/market/vix","vix"],
 ["富途財經新聞","/api/news/futu","news"],
 ["個股新聞","/api/market/volume-leader-news?stocks=2330%3A%E5%8F%B0%E7%A9%8D%E9%9B%BB","leaderNews"],
 ["盤前分析（需登入）","/api/market/morning-brief","auth"],
 ["資料來源健康","/api/market/source-health","sources"]
];
const fail=[],warn=[],results=[];
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(new Date());
const get=(t)=>parts.find(p=>p.type===t)?.value;
const day=get("weekday"),minute=Number(get("hour"))*60+Number(get("minute"));
const nightOpen=((["Mon","Tue","Wed","Thu","Fri"].includes(day)&&minute>=900)||(["Tue","Wed","Thu","Fri","Sat"].includes(day)&&minute<300));
function issue(name,kind,msg){(kind==="error"?fail:warn).push(name+": "+msg);}
function validDate(date){return typeof date==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&date<=today;}
function stale(date){return validDate(date)&&Date.parse(today+"T00:00:00Z")-Date.parse(date+"T00:00:00Z")>4*86400000;}
async function check([name,path,kind]){
 let response,body=null,elapsed=0;
 try{
  const started=Date.now();
  response=await fetch(BASE+path,{signal:AbortSignal.timeout(19000),headers:{Accept:"application/json,text/html"}});
  elapsed=Date.now()-started;
  const raw=await response.text();
  try{body=JSON.parse(raw);}catch{body={raw:raw.slice(0,400)};}
  const status=response.status;
  const summary={name,path,http:status,latencyMs:elapsed,status:body?.status??null,date:body?.asOf??body?.dataDate??body?.date??null};
  results.push(summary);
  if(kind==="html"){if(!response.ok||!raw.includes("AI 股市龍蝦"))issue(name,"error","首頁無法正常顯示");return;}
  if(kind==="auth"){if(status===401){issue(name,"warning","需要登入，無法驗證會員內文");return;}if(!response.ok||body?.status!=="ok")issue(name,"error","HTTP "+status+"／"+body?.status);return;}
  if(kind==="index"){if(status===409&&!(["Mon","Tue","Wed","Thu","Fri"].includes(day)&&minute>=540&&minute<=810))return;if(!response.ok||body?.status!=="ok")issue(name,"warning","非正常回應 HTTP "+status);return;}
  if(kind==="night"){if(status===409&&!nightOpen)return;if(nightOpen&&(!response.ok||body?.status!=="ok"))issue(name,"error","夜盤時段無有效報價 HTTP "+status+" "+(body?.status||""));return;}
  if(kind==="sources"&&response.ok&&body?.status==="degraded"){issue(name,"warning","部分上游來源異常");return;}\n  if(!response.ok||body?.status!=="ok"){issue(name,"error","HTTP "+status+" "+(body?.status||""));return;}
  if(kind==="flow"){
   if(!Array.isArray(body.volumeLeaders)||body.volumeLeaders.length<10)issue(name,"error","成交金額排行不足10檔");
   if(!Array.isArray(body.groups)||body.groups.length<3)issue(name,"error","產業資料不足3組");
   if(!body.asOfVerified||!validDate(body.asOf))issue(name,"warning","排行交易日未經驗證");
   else if(stale(body.asOf))issue(name,"error","排行日期過舊 "+body.asOf);
   if(body.coverage==="ranking_partial")issue(name,"warning","僅部分股票覆蓋，產業排行可能不完整");
   summary.source=body.source;
   summary.leaders=body.volumeLeaders?.length;
   summary.groups=body.groups?.length;
  }
  if(kind==="institutional"){
   if(!Array.isArray(body.rows)||body.rows.length<3)issue(name,"error","法人資料不足");
   if(!validDate(body.dataDate)||stale(body.dataDate))issue(name,"warning","法人資料日期異常 "+body.dataDate);
  }
  if(kind==="close"&&(!validDate(body.date)||stale(body.date)))issue(name,"warning","收盤資料日期過舊 "+body.date);
  if(kind==="global"&&(!Array.isArray(body.quotes)||body.quotes.filter(x=>typeof x.value==="number").length<3))issue(name,"error","全球市場有效報價不足3筆");
  if(kind==="news"&&(!Array.isArray(body.news)||body.news.length<5))issue(name,"error","富途新聞不足5筆");
  if(kind==="vix"&&!(typeof body.value==="number"&&body.value>0))issue(name,"error","VIX 無有效數值");
  if(kind==="leaderNews"&&(!Array.isArray(body.items)||body.items.length===0))issue(name,"warning","個股新聞暫無資料");
  if(kind==="sources"&&Array.isArray(body.results)){const bad=body.results.filter(x=>x.status!=="ok");if(bad.length)issue(name,"warning",bad.map(x=>x.source).join(", ")+" 來源異常");}
 }catch(e){results.push({name,path,error:String(e)});issue(name,"error",String(e));}
}
(async()=>{
 await Promise.all(cases.map(check));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),taipeiDate:today,results,failures:fail,warnings:warn},null,2));
 if(fail.length){console.error("FAIL: "+fail.length+" critical health checks");process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1;});
