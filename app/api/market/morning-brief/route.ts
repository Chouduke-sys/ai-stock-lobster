import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Q={label:string;symbol:string;value:number|null;changePct:number|null;time:string|null};
const symbols:[string,string][]=[["台指期近月","TX=F"],["標普500期貨","ES=F"],["那斯達克100期貨","NQ=F"],["費城半導體","^SOX"],["那斯達克指數","^IXIC"],["美元／新台幣","TWD=X"],["美元指數","DX-Y.NYB"],["VIX","^VIX"],["美國10年公債殖利率","^TNX"]];
async function quote([label,symbol]:[string,string]):Promise<Q>{
 const empty={label,symbol,value:null,changePct:null,time:null};
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const res=await fetch("https://"+host+"/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=5d",{next:{revalidate:300},signal:AbortSignal.timeout(4000),headers:{"User-Agent":"Mozilla/5.0"}});
   if(!res.ok)continue;
   const result=(await res.json() as {chart?:{result?:{meta?:{regularMarketPrice?:number;previousClose?:number;chartPreviousClose?:number;regularMarketTime?:number}}[]}}).chart?.result?.[0]?.meta;
   const value=result?.regularMarketPrice,prev=result?.previousClose??result?.chartPreviousClose;
   if(typeof value!=="number"||!Number.isFinite(value))continue;
   return {label,symbol,value,changePct:typeof prev==="number"&&prev!==0?(value/prev-1)*100:null,time:typeof result?.regularMarketTime==="number"?new Date(result.regularMarketTime*1000).toISOString():null};
  }catch{}
 }
 return empty;
}
function taipeiParts(){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const v=(t:string)=>p.find(x=>x.type===t)?.value??"00";
 return {date:v("year")+"-"+v("month")+"-"+v("day"),minute:Number(v("hour"))*60+Number(v("minute"))};
}
export async function GET(){
 const now=taipeiParts(),reportDate=now.minute>=510?now.date:new Date(Date.parse(now.date+"T00:00:00+08:00")-86400000).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
 const [quotes,twse,news]=await Promise.all([
  Promise.all(symbols.map(quote)),
  fetch("https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.json():null).catch(()=>null),
  fetch("https://news.google.com/rss/search?q="+encodeURIComponent("台股 外資 投信 融資 台幣 聯準會 川普 when:2d")+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",{next:{revalidate:600},signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.text():"").catch(()=>"")
 ]);
 const by=(symbol:string)=>quotes.find(q=>q.symbol===symbol);
 const us=by("ES=F"),tech=by("NQ=F"),semi=by("^SOX"),fx=by("TWD=X"),vix=by("^VIX");
 const pct=(q:Q|undefined)=>q?.changePct==null?"資料待確認":(q.changePct>=0?"+":"")+q.changePct.toFixed(2)+"%";
 const signals=[us,tech,semi].filter(q=>q?.changePct!=null) as Q[];
 const positive=signals.filter(q=>(q.changePct??0)>0).length,negative=signals.filter(q=>(q.changePct??0)<0).length;
 const stance=!signals.length?"資料不足，暫不判斷方向":positive>negative?"國際科技與期貨風險偏好偏正向":negative>positive?"國際科技與期貨走弱，短線宜保守":"多空訊號分歧，偏向區間震盪";
 const flow=twse&&typeof twse==="object"?twse as {date?:string;data?:string[][];fields?:string[]}:null;
 const flowRows=Array.isArray(flow?.data)?flow!.data!.slice(0,8).map(row=>row.join("／")).filter(Boolean):[];
 const title=news.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&")??null;
 const sections=[
  {title:"海外股市與台指期盤前氣氛",body:"標普500期貨 "+pct(us)+"、那斯達克100期貨 "+pct(tech)+"、費城半導體 "+pct(semi)+"。"+stance+"。台指期夜盤若無授權有效報價，不以美股期貨冒充台指期。"},
  {title:"外資、投信與法人籌碼",body:flowRows.length?"證交所最近可取得的三大法人彙總（"+(flow?.date??"日期未明")+"）："+flowRows.slice(0,4).join("；")+"。此為已公布資料，非當日盤前即時買賣。":"證交所法人彙總暫無可解析資料；不推估外資或投信買超。開盤後應觀察台積電、電子權值與期貨大額交易。"},
  {title:"融資、融券與槓桿風險",body:"本次資料源尚未提供可核對的最新融資融券餘額及變化，因此不判定散戶加碼或減碼。若融資餘額創高、指數跌破均線，需提高風險控管。"},
  {title:"期貨未平倉與選擇權籌碼",body:"尚未取得可核對的外資台指期淨未平倉、選擇權 Put/Call Ratio 及結算部位；不以傳聞口數代替官方數據。留意結算日、期現貨價差與跳空缺口。"},
  {title:"新台幣、美元與利率",body:"美元／新台幣最近報價變動 "+pct(fx)+"，美元指數 "+pct(by("DX-Y.NYB"))+"，美國10年公債殖利率指標變動 "+pct(by("^TNX"))+"。匯率走貶可能加重外資匯出疑慮，仍須搭配實際資金流確認。"},
  {title:"市場恐慌與波動風險",body:vix?.value!=null?"VIX 最新可取得報價 "+vix.value.toFixed(2)+"，變動 "+pct(vix)+"。VIX 是未來30天美股預期波動率，不能直接當作台股漲跌預測。":"VIX 報價暫無法核對，暫不判定恐慌程度。"},
  {title:"技術面、成交量與關鍵觀察",body:"盤前觀察昨日高低點、5日／10日／20日均線、開盤前30分鐘量能與是否站穩開盤價。本站目前沒有可驗證的當日完整均線、台指期成交量與支撐壓力數字，因此不提供假精確點位。"},
  {title:"政策、重要人士與科技產業",body:title?"近期可取得的相關新聞標題："+title+"。請至重要人士快訊核對來源與發布時間，勿將標題當成官方發言逐字稿。":"暫無可驗證的近期政策標題；關注川普關稅政策、聯準會利率訊號、台灣半導體與AI供應鏈消息。"},
  {title:"盤前操作結論",body:stance+"。在匯率、法人籌碼與量能未同步確認前，維持中性觀察；若開盤量增且領漲族群擴散，再提高多方信心。高槓桿部位應先設定停損及資金上限。"}
 ];
 return NextResponse.json({status:"ok",reportDate,generatedAt:new Date().toISOString(),scheduledAt:"08:30 Asia/Taipei",isAfterDailyCutoff:now.minute>=510,stance,quotes,sections,source:"Yahoo Finance / TWSE / Google News RSS",method:"依可取得數據產生規則式盤前分析，不是人工撰寫或經模型驗證的每日研究報告。部分行情可能延遲；資料不足的項目明確標示，不捏造籌碼數據。"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
}
