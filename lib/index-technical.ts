export type TechnicalSignal={body:string;sentiment:"bullish"|"bearish"|"neutral";verdict:string;valid:boolean;date:string|null};
type Chart={chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[];high?:(number|null)[];low?:(number|null)[];volume?:(number|null)[]}>};meta?:{regularMarketPrice?:number;regularMarketTime?:number}}>}};
export async function getIndexTechnical():Promise<TechnicalSignal>{
 const fallback:TechnicalSignal={body:"技術指標暫未取得可驗證行情，請以交易所公告為準。",sentiment:"neutral",verdict:"技術數據待更新",valid:false,date:null};
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const response=await fetch("https://"+host+"/v8/finance/chart/%5ETWII?interval=1d&range=6mo",{next:{revalidate:300},signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!response.ok)continue;
   const json=await response.json() as Chart;
   const result=json.chart?.result?.[0],q=result?.indicators?.quote?.[0];
   if(!result?.timestamp||!q?.close||!q.volume)continue;
   const bars=result.timestamp.flatMap((t,i)=>{const close=q.close?.[i],volume=q.volume?.[i];return typeof close==="number"&&close>0&&typeof volume==="number"&&volume>=0?[{t,close,volume}]:[];});
   if(bars.length<65)continue;
   const latest=bars[bars.length-1],prev=bars[bars.length-2];
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
   const volumeRatio=averageVolume>0?latest.volume/averageVolume:null;
   const price=latest.close;
   const score=(price>ma5?1:-1)+(price>ma20?1:-1)+(ma5>ma20?1:-1)+(rsi>55?1:rsi<45?-1:0);
   const sentiment=score>=2?"bullish":score<=-2?"bearish":"neutral";
   const verdict=sentiment==="bullish"?"均線與動能偏多":sentiment==="bearish"?"均線與動能偏空":"技術訊號分歧";
   const date=new Date(latest.t*1000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
   const body="加權指數 "+price.toFixed(0)+" 點；5日線 "+ma5.toFixed(0)+"、20日線 "+ma20.toFixed(0)+"、60日線 "+ma60.toFixed(0)+"；RSI(14) "+rsi.toFixed(1)+"；"+(volumeRatio===null?"量能比尚未取得":"成交量為前20日均量的 "+volumeRatio.toFixed(2)+" 倍")+"。資料日 "+date+"";
   return {body,sentiment,verdict,valid:true,date};
  }catch{}
 }
 return fallback;
}
