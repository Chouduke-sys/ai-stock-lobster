export type Direction="bullish"|"bearish"|"neutral";
type Signal={name:string;weight:number;direction:Direction|null};
export function assessAllocation(signals:Signal[],baseAllocation:number|null){
 const observed=signals.filter(s=>s.direction!==null);
 const coverage=observed.reduce((n,s)=>n+s.weight,0);
 const signed=observed.reduce((n,s)=>n+s.weight*(s.direction==="bullish"?1:s.direction==="bearish"?-1:0),0);
 const score=coverage>0?Math.round(50+50*signed/coverage):null;
 // Conservative provisional exposure limits; not calibrated to realized returns.
 const riskCap=coverage<50?30:coverage<75?50:score===null?30:score>=75?90:score>=60?75:score>=45?60:score>=30?45:30;
 const recommendedAllocation=baseAllocation===null||coverage<50?null:Math.min(90,Math.max(0,baseAllocation),riskCap);
 return {score,coverage,riskCap,recommendedAllocation,signals,method:"初始權重風險規則，未完成歷史回測校準；資料覆蓋率不足50%不提供倉位，低於75%最高50%。"};
}
