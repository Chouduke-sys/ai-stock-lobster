export type PolicySignal={title:string;sector:string;impact:"bullish"|"bearish";reason:string;url:string;publishedAt:string};
const themes=[
 {query:"聯準會 Fed 利率 CPI PCE 鮑爾",sector:"金融／科技估值",positive:/降息|通膨降溫|低於預期|鴿派|寬鬆|暫緩升息/,negative:/升息|通膨升溫|高於預期|鷹派|緊縮|延後降息/,reasonUp:"資金成本與估值壓力可能下降",reasonDown:"利率與估值壓力可能上升"},
 {query:"美國 關稅 晶片 出口管制 台灣",sector:"半導體／出口供應鏈",positive:/豁免|取消關稅|降低關稅|放寬|解除限制|達成協議/,negative:/加徵關稅|提高關稅|擴大禁令|出口限制|制裁|禁售/,reasonUp:"貿易或出口限制可能緩和",reasonDown:"出口與供應鏈成本風險可能升高"},
 {query:"輝達 NVIDIA AMD AI 伺服器 資本支出",sector:"AI伺服器／PCB／散熱／半導體",positive:/上調展望|增加資本支出|擴大投資|需求強勁|優於預期|訂單成長/,negative:/下調展望|削減資本支出|需求疲弱|低於預期|延後出貨|砍單/,reasonUp:"AI需求與資本支出預期改善",reasonDown:"AI需求或出貨展望可能轉弱"},
 {query:"台灣 央行 金管會 國安基金 能源 政策",sector:"金融／營建／電子",positive:/降息|鬆綁|補助|擴大投資|護盤|減稅/,negative:/升息|限貸|緊縮|提高電價|限制|課稅/,reasonUp:"國內政策可能改善資金或企業經營條件",reasonDown:"政策可能提高成本或壓抑資金動能"},
 {query:"美中 地緣政治 台海 原油 能源",sector:"航運／電子／能源",positive:/停火|和談|緩和|協議|油價下跌/,negative:/衝突升級|封鎖|制裁|油價飆升|軍事衝突/,reasonUp:"地緣或能源風險可能下降",reasonDown:"地緣或能源風險可能上升"}
];
const decode=(s:string)=>s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]*>/g,"").trim();
const tag=(xml:string,key:string)=>decode(xml.match(new RegExp("<"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+key+">","i"))?.[1]??"");
export async function getPolicySignals():Promise<{items:PolicySignal[];score:number|null}>{
 const cutoff=Date.now()-48*3600000;
 const results=await Promise.all(themes.map(async theme=>{
  try{
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(theme.query+" when:2d")+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
   const response=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!response.ok)return null;
   const rss=await response.text();
   for(const match of Array.from(rss.matchAll(/<item>([\s\S]*?)<\/item>/gi)).slice(0,12)){
    const title=tag(match[1],"title"),link=tag(match[1],"link"),date=Date.parse(tag(match[1],"pubDate"));
    if(!title||!link.startsWith("https://news.google.com/")||!Number.isFinite(date)||date<cutoff||date>Date.now()+3600000)continue;
    const up=theme.positive.test(title),down=theme.negative.test(title);
    if(up===down)continue; // no verifiable direction or conflicting headline
    return {title:title.slice(0,100),sector:theme.sector,impact:up?"bullish" as const:"bearish" as const,reason:up?theme.reasonUp:theme.reasonDown,url:link,publishedAt:new Date(date).toISOString()};
   }
  }catch{}
  return null;
 }));
 const items=results.filter((x):x is PolicySignal=>x!==null).slice(0,3);
 const score=items.length?items.reduce((sum,item)=>sum+(item.impact==="bullish"?1:item.impact==="bearish"?-1:0),0):null;
 return {items,score};
}
