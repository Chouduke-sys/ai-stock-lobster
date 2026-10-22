import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Row=Record<string,string>;
const sectors=[
 {name:"CCL／銅箔基板",chain:"上游材料",stocks:["2383","6274","6213","6672","1303"]},
 {name:"PCB／高階電路板",chain:"中游製造",stocks:["2368","2313","3044","4958","5439","2355"]},
 {name:"PCB 上游銅箔／玻纖",chain:"上游原料",stocks:["8358","1815","1802","5475"]},
 {name:"ABF／IC 載板",chain:"中游載板",stocks:["3037","3189","8046"]},
 {name:"先進封裝／CoWoS",chain:"晶片封裝",stocks:["2330","3711","2449","6239","3374"]},
 {name:"先進封裝設備",chain:"上游設備",stocks:["6187","3131","3680","6640"]},
 {name:"AI 伺服器／組裝",chain:"下游系統",stocks:["2317","2382","3231","6669","2356"]},
 {name:"散熱／液冷",chain:"零組件",stocks:["3017","3324","3653","2421"]},
 {name:"高速網通／CPO",chain:"網通光電",stocks:["2345","6285","3450","4979"]},
 {name:"AI 電源／BBU",chain:"零組件",stocks:["2308","2301","6412","6781"]}
];
function num(v:unknown){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:0;}
function twDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export async function GET(){
 try{
  const [dailyRes,instRes]=await Promise.all([
   fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",{next:{revalidate:300},signal:AbortSignal.timeout(8000)}),
   fetch("https://www.twse.com.tw/rwd/zh/fund/T86?date="+twDate().replace(/-/g,"")+"&selectType=ALL&response=json",{next:{revalidate:300},signal:AbortSignal.timeout(8000)})
  ]);
  if(!dailyRes.ok)throw Error("證交所個股行情來源不可用");
  const raw=await dailyRes.json() as Row[];
  if(!Array.isArray(raw)||raw.length<100)throw Error("證交所個股行情資料不足");
  const rows=raw.flatMap(r=>{const symbol=String(r.Code??"").trim();if(!/^\d{4}$/.test(symbol))return [];const volume=num(r.TradeVolume),value=num(r.TradeValue),close=num(r.ClosingPrice);return [{symbol,name:r.Name??symbol,volume,value,close,change:r.Change??"",transactions:num(r.Transaction)}];});
  const bySymbol=new Map(rows.map(r=>[r.symbol,r]));
  const groups=sectors.map(g=>{const stocks=g.stocks.flatMap(code=>{const row=bySymbol.get(code);return row?[row]:[]});const turnover=stocks.reduce((sum,r)=>sum+r.value,0);return {...g,turnover,stocks:stocks.sort((a,b)=>b.value-a.value).slice(0,5)};}).filter(g=>g.turnover>0).sort((a,b)=>b.turnover-a.turnover);
  const volumeLeaders=rows.filter(r=>r.volume>0&&r.close>0).sort((a,b)=>b.value-a.value).slice(0,15);
  let instDate:string|null=null;const buyers:{symbol:string;name:string;shares:number;volume:number;value:number}[]=[];
  if(instRes.ok){
   const data=await instRes.json() as {stat?:string;date?:string;fields?:string[];data?:string[][]};
   if(data.stat==="OK"&&Array.isArray(data.fields)&&Array.isArray(data.data)){
    const code=data.fields.indexOf("證券代號"),name=data.fields.indexOf("證券名稱"),total=data.fields.indexOf("三大法人買賣超股數");
    if(code>=0&&total>=0){instDate=data.date??null;for(const r of data.data){const symbol=String(r[code]??"").trim(),shares=num(r[total]);if(!/^\d{4}$/.test(symbol)||shares<=0)continue;const quote=bySymbol.get(symbol);buyers.push({symbol,name:r[name]??quote?.name??symbol,shares,volume:quote?.volume??0,value:quote?.value??0});}}
   }
  }
  buyers.sort((a,b)=>b.shares-a.shares);
  return NextResponse.json({status:"ok",asOf:twDate(),groups,topSector:groups[0]??null,volumeLeaders,buyers:buyers.slice(0,15),institutionalDate:instDate,source:"TWSE STOCK_DAY_ALL / T86",note:"族群按本站公開成分股清單計算成交金額，不等於淨資金流入；大戶以三大法人當日買超作代理，不等於主力或單一大戶。資料為最近取得的盤後快照，並非逐筆即時。"},
   {headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
 }catch(e){return NextResponse.json({status:"unavailable",error:e instanceof Error?e.message:"暫無可驗證行情"},{status:503});}
}
