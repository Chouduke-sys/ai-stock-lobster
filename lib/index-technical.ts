export type TechnicalSignal={body:string;sentiment:"bullish"|"bearish"|"neutral";verdict:string;valid:boolean;date:string|null};
type Chart={chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[];high?:(number|null)[];low?:(number|null)[];volume?:(number|null)[]}>};meta?:{regularMarketPrice?:number;regularMarketTime?:number}}>}};
async function latestTwseClose():Promise<{date:string;close:number}|null>{
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const [year,month]=today.split("-");
 for(const offset of [0,-1]){
  const first=new Date(Date.UTC(Number(year),Number(month)-1+offset,1));
  const ym=first.getUTCFullYear().toString()+String(first.getUTCMonth()+1).padStart(2,"0")+"01";
  try{
   const res=await fetch("https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date="+ym,{cache:"no-store",signal:AbortSignal.timeout(5000)});
   if(!res.ok)continue;
   const data=await res.json() as {stat?:string;data?:string[][]};
   if(data.stat!=="OK"||!Array.isArray(data.data))continue;
   const rows=data.data.flatMap(row=>{
    const match=String(row[0]??"").match(/^(\d{3})\/(\d{2})\/(\d{2})$/);
    const close=Number(String(row[4]??"").replace(/,/g,""));
    return match&&Number.isFinite(close)&&close>0?[{date:(Number(match[1])+1911)+"-"+match[2]+"-"+match[3],close}]:[];
   }).filter(row=>row.date<=today);
   if(rows.length)return rows[rows.length-1];
  }catch{}
 }
 return null;
}
export async function getIndexTechnical():Promise<TechnicalSignal>{
 const fallback:TechnicalSignal={body:"技術指標暫未取得可驗證行情，請以交易所公告為準。",sentiment:"neutral",verdict:"技術數據待更新",valid:false,date:null};
 const official=await latestTwseClose();
 const taipeiNow=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Taipei"}));
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const weekday=taipeiNow.getDay();
 const expected=new Date(today+"T00:00:00+08:00");
 // Before the cash close, the latest completed session is a previous weekday.
 const back=weekday===0?2:weekday===1?3:weekday===6?1:1;
 expected.setUTCDate(expected.getUTCDate()-back);
 const expectedDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(expected);
 // Holidays may push the official trading session further back; do not accept
 // a Yahoo bar older than the most recent verified TWSE trading date.
 const requiredDate=official?.date??expectedDate;
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const response=await fetch("https://"+host+"/v8/finance/chart/%5ETWII?interval=1d&range=6mo",{next:{revalidate:300},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!response.ok)continue;
   const json=await response.json() as Chart;
   const result=json.chart?.result?.[0],q=result?.indicators?.quote?.[0];
   if(!result?.timestamp||!q?.close||!q.volume)continue;
   const bars=result.timestamp.flatMap((t,i)=>{const close=q.close?.[i],volume=q.volume?.[i];return typeof close==="number"&&close>0&&typeof volume==="number"&&volume>=0?[{t,close,volume}]:[];});
   if(bars.length<65)continue;
   const yahooLast=bars[bars.length-1];
   const yahooDate=new Date(yahooLast.t*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
   let officialOverride=false;
   if(official&&official.date>yahooDate){
    bars.push({t:Date.parse(official.date+"T13:30:00+08:00")/1000,close:official.close,volume:NaN});
    officialOverride=true;
   }else if(official&&official.date===yahooDate&&Math.abs(official.close-yahooLast.close)>0.5){
    yahooLast.close=official.close;
   }
   const latest=bars[bars.length-1];
   const latestDate=new Date(latest.t*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
   if(latestDate<requiredDate)continue;
   const age=Date.now()-latest.t*1000;
   if(age< -86400000||age>6*86400000)continue;
   const ma=(n:number)=>bars.slice(-n).reduce((a,b)=>a+b.close,0)/n;
   const ma5=ma(5),ma20=ma(20),ma60=ma(60);
   const changes=bars.slice(-15).map((v,i,arr)=>i? v.close-arr[i-1].close:0).slice(1);
   const gains=changes.reduce((sum,v)=>sum+Math.max(0,v),0)/14;
   const losses=changes.reduce((sum,v)=>sum+Math.max(0,-v),0)/14;
   const rsi=losses===0?100:100-100/(1+gains/losses);
   const priorVolumes=bars.slice(-21,-1).map(x=>x.volume);
   const averageVolume=priorVolumes.reduce((a,b)=>a+b,0)/priorVolumes.length;
   const volumeRatio=!officialOverride&&averageVolume>0?latest.volume/averageVolume:null;
   const price=latest.close;
   const score=(price>ma5?1:-1)+(price>ma20?1:-1)+(ma5>ma20?1:-1)+(rsi>55?1:rsi<45?-1:0);
   const sentiment=score>=2?"bullish":score<=-2?"bearish":"neutral";
   const verdict=sentiment==="bullish"?"均線與動能偏多":sentiment==="bearish"?"均線與動能偏空":"技術訊號分歧";
   const date=new Date(latest.t*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
   const body="加權指數 "+price.toFixed(0)+" 點；5日線 "+ma5.toFixed(0)+"、20日線 "+ma20.toFixed(0)+"、60日線 "+ma60.toFixed(0)+"；RSI(14) "+rsi.toFixed(1)+"；"+(volumeRatio===null?"最新成交量尚待同來源驗證":"成交量為前20日均量的 "+volumeRatio.toFixed(2)+" 倍")+"。資料日 "+date+"";
   return {body,sentiment,verdict,valid:true,date};
  }catch{}
 }
 return fallback;
}
