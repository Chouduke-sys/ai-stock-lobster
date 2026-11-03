type Risk={score:number|null;coverage:number;riskCap:number;ruleAllocation?:number|null;recommendedAllocation?:number|null;mode?:string;reason?:string;method?:string;signals:{name:string;weight:number;direction:"bullish"|"bearish"|"neutral"|null}[]};
export type AllocationProps={value:number|null;risk?:Risk;base?:number|null;backtest?:{date?:string|null;sampleDays?:number;reason?:string};generatedAt:string};
export default function AllocationAnalysis({value,risk,base,backtest,generatedAt}:AllocationProps){
 const percent=typeof value==="number"&&Number.isFinite(value)?Math.min(90,Math.max(0,value)):null;
 const mode=risk?.mode==="risk-rules"?"規則式風險參考":risk?.mode==="backtest-risk-capped"?"動能基準＋風險限制":"模型參考";
 return <section className="allocation-analysis" aria-label="股票倉位水位分析">
  <div className="allocation-head"><div><span>建議股票倉位 · {mode}</span><strong>{percent===null?"待資料補齊":<>{percent}<small>%</small></>}</strong></div><div className="allocation-context"><span>有效風險訊號覆蓋</span><strong>{typeof risk?.coverage==="number"?risk.coverage+"%":"尚未提供"}</strong><small>資料更新：{new Date(generatedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</small></div></div>
  {percent!==null&&<><meter min={0} max={100} value={percent} aria-label={`參考股票水位 ${percent}%`}/><p className="allocation-formula">參考計算：{typeof base==="number"&&Number.isFinite(base)?`動能基準 ${base}%`:`規則式水位 ${risk?.ruleAllocation??percent}%`}，風險上限 {risk?.riskCap??"待確認"}% → 最終水位 {percent}%。</p></>}
  <p>{risk?.reason??(percent===null?"目前缺少足夠的有效資料或模型結果，無法產生可核對的倉位數字。":"依目前可取得資料產生參考，請核對各項資料日期。")}</p>
  {risk?.signals?.length>0&&<details><summary>查看倉位分析依據</summary><ul>{risk.signals.map(signal=><li key={signal.name}><span>{signal.name}<small>權重 {signal.weight}%</small></span><b className={signal.direction==="bullish"?"allocation-bull":signal.direction==="bearish"?"allocation-bear":""}>{signal.direction==="bullish"?"偏多":signal.direction==="bearish"?"偏空":signal.direction==="neutral"?"中性":"待確認"}</b></li>)}</ul><p>{risk.method}</p>{backtest&&<p>歷史模型：{backtest.date?`資料至 ${backtest.date}，${backtest.sampleDays??0} 個樣本。`:"目前無可用回測基準。"}{backtest.reason}</p>}</details>}
  <small className="allocation-note">反映目前市場訊號，未納入個人風險承受度與資金需求；不是報酬保證。缺資料不視為中性，參考水位上限90%。</small>
 </section>;
}
