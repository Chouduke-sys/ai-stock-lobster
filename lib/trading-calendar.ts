import {finmindRows} from "./finmind";
import {getQuote} from "./yahoo-quote";
import {cachedProvider} from "./provider-policy";
import {marketDate,taipeiDate,taipeiMinute} from "./market-data";
type Holiday={Name?:string;Date?:string;Description?:string};
export function scheduledTradingDay(date:string,holidays:Holiday[]):boolean|null{
 const relevant=holidays.filter(row=>marketDate(row.Date)?.slice(0,4)===date.slice(0,4));
 if(!relevant.length)return null;
 const row=relevant.find(row=>marketDate(row.Date)===date);
 if(row){
  if(/開始交易|最後交易/.test((row.Name??"")+" "+(row.Description??"")))return true;
  return false;
 }
 const day=new Date(date+"T00:00:00Z").getUTCDay();
 return day!==0&&day!==6;
}
async function officialTaiwanCalendar(now=new Date()){
 const date=taipeiDate(now);
 const months=[0,-1].map(offset=>{
  const d=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1+offset,1));
  return d.toISOString().slice(0,7).replace("-","")+"01";
 });
 const [holidayResult,...monthResults]=await Promise.allSettled([
  fetch("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule",{next:{revalidate:3600},signal:AbortSignal.timeout(5000)}).then(async r=>r.ok?await r.json():[]),
  ...months.map(month=>fetch("https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date="+month+"&response=json",{next:{revalidate:15},signal:AbortSignal.timeout(5000)}).then(async r=>r.ok?await r.json():null))
 ]);
 const holidays:Holiday[]=holidayResult.status==="fulfilled"&&Array.isArray(holidayResult.value)?holidayResult.value:[];
 const closes=monthResults.flatMap(result=>{
  if(result.status!=="fulfilled"||result.value?.stat!=="OK"||!Array.isArray(result.value.data))return [];
  return result.value.data.flatMap((row:unknown[])=>{
   const day=marketDate(row[0]),close=Number(String(row[4]??"").replace(/,/g,""));
   return day&&day<=date&&Number.isFinite(close)&&close>0?[{date:day,close}]:[];
  });
 }).sort((a,b)=>a.date.localeCompare(b.date));
 const prior=closes.filter(row=>row.date<date).at(-1)??null;
 const completed=closes.filter(row=>row.date<date||taipeiMinute(now)>=810).at(-1)??null;
 return {date,referenceDate:prior?.date??null,referenceClose:prior,latestCompletedDate:completed?.date??null,isTradingDay:scheduledTradingDay(date,holidays),source:"TWSE holidaySchedule / FMTQIK completed sessions"};
}

export async function taiwanCalendar(now=new Date()){
 const date=taipeiDate(now),afterClose=taipeiMinute(now)>=810;
 const published=await cachedProvider("calendar:public:"+date+":"+afterClose,15000,async()=>{
  const rows=await finmindRows("TaiwanStockTradingDate");
  const dates=rows?.map(row=>marketDate(row.date)).filter((d):d is string=>Boolean(d)).sort()??[];
  if(!dates.length||dates.at(-1)!<date)return null; // Unknown annual coverage is not a holiday.
  const referenceDate=dates.filter(day=>day<date).at(-1)??null;
  if(!referenceDate)return null;
  const quote=await getQuote("臺灣加權指數","^TWII");
  const priorIndex=quote.trendDates?.indexOf(referenceDate)??-1;
  const referenceClose=priorIndex>=0?{date:referenceDate,close:quote.trend5d[priorIndex]}:null;
  const isTradingDay=dates.includes(date);
  const todayClosed=afterClose&&isTradingDay&&quote.quoteDate===date&&
   quote.time!==null&&Date.parse(quote.time)>=Date.parse(date+"T13:30:00+08:00");
  return {date,referenceDate,referenceClose,latestCompletedDate:todayClosed?date:referenceDate,
   isTradingDay,source:"FinMind trading dates / Yahoo completed-session quotes"};
 });
 return published??await officialTaiwanCalendar(now);
}
