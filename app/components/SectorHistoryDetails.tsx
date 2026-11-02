import {historyUrl} from "../../lib/sector-history";

type Point={date:string;turnover:number|null;share:number|null;observed:number};
export default function SectorHistoryDetails({name,series,expectedStocks,priorAverage,comparisonDates}:{name:string;series:Point[];expectedStocks:number;priorAverage:number|null;comparisonDates:string[]}) {
 const values=series.filter(point=>point.turnover!==null);
 const low=Math.min(...values.map(point=>point.turnover!)),high=Math.max(...values.map(point=>point.turnover!));
 const points=series.map((point,i)=>point.turnover===null?null:`${8+i*304/Math.max(1,series.length-1)},${64-(point.turnover-low)/Math.max(1,high-low)*52}`);
 // Split at missing observations: never draw a line through unknown values.
 const segments=points.reduce<string[][]>((all,point)=>{
  if(point===null){all.push([]);return all;}all[all.length-1].push(point);return all;
 },[[]]).filter(segment=>segment.length>1);
 return <details className="sector-history-details">
  <summary>查看 {series.length} 個交易日歷史與來源</summary>
  <div className="sector-history-body">
   <p>{typeof priorAverage==="number"?`前五個已驗證交易日均值 ${(priorAverage/1e8).toFixed(1)} 億元`:`相同成分股資料尚未完整，暫不比較`}
    {comparisonDates.length>0&&<small>比較日：{[...comparisonDates].reverse().join("、")}</small>}</p>
   {values.length>1&&<figure className="sector-history-chart"><svg viewBox="0 0 320 76" role="img" aria-label={`${name}成交金額歷史，${series[0]?.date} 至 ${series.at(-1)?.date}，最低 ${(low/1e8).toFixed(1)} 億、最高 ${(high/1e8).toFixed(1)} 億`}>
    <path d="M8 12H312 M8 38H312 M8 64H312" stroke="#38506b" strokeWidth=".6" fill="none"/>
    {segments.map((segment,i)=><polyline key={i} points={segment.join(" ")} fill="none" stroke="#e5b76c" strokeWidth="2" strokeLinejoin="round"/>)}
   </svg><figcaption><span>{series[0]?.date}</span><span>成交金額 · 億元</span><span>{series.at(-1)?.date}</span></figcaption></figure>}
   <div className="sector-history-table"><table><caption>{name} · 固定 {expectedStocks} 檔成分股 · 盤後歷史</caption><thead><tr><th>交易日</th><th>成交金額</th><th>涵蓋成分股</th><th>原始資料</th></tr></thead><tbody>
    {[...series].reverse().map(point=><tr key={point.date}><td>{point.date}</td><td>{point.turnover===null?"尚未齊全":(point.turnover/1e8).toFixed(1)+" 億"}</td><td>{point.observed} / {expectedStocks}</td><td><a href={historyUrl("twse",point.date)} target="_blank" rel="noopener noreferrer">上市</a> · <a href={historyUrl("tpex",point.date)} target="_blank" rel="noopener noreferrer">上櫃</a></td></tr>)}
   </tbody></table></div>
  </div>
 </details>;
}
