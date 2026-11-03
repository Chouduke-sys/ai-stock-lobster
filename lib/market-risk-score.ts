export type Direction="bullish"|"bearish"|"neutral";
type Signal={name:string;weight:number;direction:Direction|null};
export function assessAllocation(signals:Signal[],baseAllocation:number|null){
 const observed=signals.filter(s=>s.direction!==null);
 const coverage=observed.reduce((n,s)=>n+s.weight,0);
 const signed=observed.reduce((n,s)=>n+s.weight*(s.direction==="bullish"?1:s.direction==="bearish"?-1:0),0);
 const score=coverage>0?Math.round(50+50*signed/coverage):null;
 // Conservative provisional exposure limits; not calibrated to realized returns.
 const riskCap=coverage<50?30:coverage<75?50:score===null?30:score>=75?90:score>=60?75:score>=45?60:score>=30?45:30;
 const modelAvailable=typeof baseAllocation==="number"&&Number.isFinite(baseAllocation);
 // Explicit provisional rule map, NOT a replacement backtest or an optimized portfolio.
 const ruleAllocation=score===null?null:score>=75?75:score>=60?60:score>=45?45:score>=30?30:20;
 const reference=modelAvailable?baseAllocation:ruleAllocation;
 const recommendedAllocation=coverage<50||reference===null?null:Math.min(90,Math.max(0,reference),riskCap);
 const mode=recommendedAllocation===null?"unavailable":modelAvailable?"backtest-risk-capped":"risk-rules";
 const reason=mode==="unavailable"?"有效風險訊號覆蓋不足50%，暫不提供倉位數字。":mode==="risk-rules"?"回測基準暫不可用，依已驗證市場風險訊號提供規則式參考水位，再套用風險上限；此水位未經回測最佳化。":"以歷史動能模型水位為基準，再依目前風險訊號限制曝險。";
 return {score,coverage,riskCap,recommendedAllocation,signals,mode,reason,ruleAllocation,method:"初始權重風險規則，未完成歷史回測校準；覆蓋不足50%不提供倉位，50%～74%最高50%。無回測基準時，風險分數>=75/60/45/30/<30分別對應75/60/45/30/20%參考水位，再套用風險上限；非個人化投資配置。"};
}
