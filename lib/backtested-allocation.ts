type Bar={date:string;close:number};
type Model={riskOn:number;riskOff:number;lookback:number};
type Backtest={allocation:number|null;date:string|null;sampleDays:number;testDays:number;annualReturn:number|null;maxDrawdown:number|null;benchmarkAnnualReturn:number|null;reason:string;model:string};
const candidates:Model[]=[];
for(const lookback of [20,60,120])for(const riskOn of [40,60,80,100])for(const riskOff of [0,20,40,60])if(riskOn>=riskOff)candidates.push({lookback,riskOn,riskOff});
function weight(bars:Bar[],index:number,model:Model){
 const start=index-model.lookback;
 if(start<0)return model.riskOff/100;
 const momentum=bars[index].close/bars[start].close-1;
 return (momentum>0?model.riskOn:model.riskOff)/100;
}
function evaluate(bars:Bar[],start:number,end:number,model:Model){
 let equity=1,peak=1,drawdown=0,prevWeight=0;
 for(let i=start;i<end;i++){
  // At close i-1, decide exposure for return i-1 -> i. No future prices used.
  const w=weight(bars,i-1,model);
  const r=bars[i].close/bars[i-1].close-1;
  const cost=Math.abs(w-prevWeight)*0.001; // 10bps per 100% turnover, illustrative
  equity*=Math.max(0.01,1+w*r-cost);
  prevWeight=w;
  peak=Math.max(peak,equity);
  drawdown=Math.max(drawdown,1-equity/peak);
 }
 const days=end-start;
 return {annualReturn:Math.pow(equity,252/Math.max(days,1))-1,maxDrawdown:drawdown};
}
function select(bars:Bar[],end:number){
 const start=Math.max(121,end-504);
 let best=candidates[0],bestScore=-Infinity;
 for(const model of candidates){
  const r=evaluate(bars,start,end,model);
  const score=r.annualReturn-1.5*r.maxDrawdown;
  if(score>bestScore){bestScore=score;best=model;}
 }
 return best;
}
async function load():Promise<Bar[]>{
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const r=await fetch("https://"+host+"/v8/finance/chart/%5ETWII?interval=1d&range=5y",{next:{revalidate:21600},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!r.ok)continue;
   const data=await r.json() as {chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:(number|null)[]}>}}>}};
   const series=data.chart?.result?.[0],timestamps=series?.timestamp??[],closes=series?.indicators?.quote?.[0]?.close??[];
   const bars=timestamps.flatMap((time,i)=>typeof closes[i]==="number"&&Number.isFinite(closes[i])&&closes[i]!>0?[{date:new Date(time*1000).toISOString().slice(0,10),close:closes[i] as number}]:[]);
   if(bars.length>=750)return bars;
  }catch{}
 }
 return [];
}
export async function backtestedAllocation():Promise<Backtest>{
 const bars=await load();
 const fallback:Backtest={allocation:null,date:null,sampleDays:bars.length,testDays:0,annualReturn:null,maxDrawdown:null,benchmarkAnnualReturn:null,reason:"歷史行情不足或無法取得，暫不提供回測最佳倉位。",model:"台灣加權指數動能擇時，滾動訓練／樣本外驗證"};
 if(bars.length<750)return fallback;
 const first=Math.max(505,bars.length-252);
 let equity=1,peak=1,maxDrawdown=0,bench=1,previousWeight=0;
 for(let i=first;i<bars.length;i++){
  // Monthly refit using only observations before test day.
  const fitEnd=i-(i-first)%21;
  const model=select(bars,fitEnd);
  const w=weight(bars,i-1,model);
  const marketReturn=bars[i].close/bars[i-1].close-1;
  equity*=Math.max(0.01,1+w*marketReturn-Math.abs(w-previousWeight)*0.001);
  bench*=1+marketReturn;
  previousWeight=w;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,1-equity/peak);
 }
 const testDays=bars.length-first,chosen=select(bars,bars.length);
 const allocation=Math.round(weight(bars,bars.length-1,chosen)*100);
 return {allocation,date:bars[bars.length-1].date,sampleDays:bars.length,testDays,annualReturn:(Math.pow(equity,252/testDays)-1)*100,maxDrawdown:maxDrawdown*100,benchmarkAnnualReturn:(Math.pow(bench,252/testDays)-1)*100,reason:"以過去約504交易日訓練動能參數，最近約252交易日逐月重新訓練做樣本外驗證；現有建議由最新已知收盤價及歷史訓練參數決定。",model:"台灣加權指數20／60／120日動能，持股0%～100%候選水位；成本假設每次100%換手0.1%，未含融資利息與稅費。"};
}
