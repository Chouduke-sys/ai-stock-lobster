import {cachedResponse} from "../../../../lib/response-cache";
import {getQuote} from "../../../../lib/yahoo-quote";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function buildResponse(){
 const [us,semi,jp,kr,fx,oil]=await Promise.all([
  getQuote("美國那斯達克","^IXIC"),getQuote("費城半導體","^SOX"),getQuote("日本日經225","^N225"),getQuote("韓國KOSPI","^KS11"),getQuote("美元／新台幣","TWD=X"),getQuote("WTI原油","CL=F")
 ]);
 if(![us,semi,jp,kr,fx,oil].some(q=>q.value!==null))return NextResponse.json({status:"unavailable",error:"全球行情來源暫時無法取得，請保留前次具時間標示的資料。"},{status:503,headers:{"Cache-Control":"no-store"}});
 const twDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const signals=[us,semi,jp,kr].filter(q=>q.changePct!==null);
 const positive=signals.filter(q=>(q.changePct??0)>0).length,negative=signals.filter(q=>(q.changePct??0)<0).length;
 const marketView=!signals.length?"國際市場報價尚未齊全，暫不判定台股方向。":positive>negative?"國際股市偏多，對台股電子權值與市場情緒較有利；仍須觀察台股成交量與外資動向。":negative>positive?"國際市場偏弱，台股短線應留意權值股賣壓、開高走低及槓桿風險。":"國際股市多空分歧，台股可能呈現族群輪動，需觀察成交量與權值股表現。";
 const asia=jp.changePct===null||kr.changePct===null?"日韓股最新漲跌資料尚未齊全。":jp.changePct>0&&kr.changePct>0?"日韓股同步上漲，亞洲科技與風險性資產情緒偏正向。":jp.changePct<0&&kr.changePct<0?"日韓股同步下跌，需警惕亞洲資金風險偏好轉弱。":"日韓股走勢分歧，不能單憑單一市場判斷台股方向。";
 const currency=fx.changePct===null?(fx.value!==null?"美元／新台幣已有 Yahoo Finance 報價（可能延遲），但缺少可驗證的前一交易日收盤價，暫不判定新台幣升貶。":"美元／新台幣匯價暫不可用，無法判定新台幣升貶。"):fx.changePct>0?"美元／新台幣報價上升，代表新台幣相對美元走貶；出口商換匯可能受惠，但也須留意外資匯出壓力。":fx.changePct<0?"美元／新台幣報價下降，代表新台幣相對美元升值；有利進口成本，但出口商美元營收換算可能承壓。":"美元／新台幣匯率變動有限，仍須觀察外資流向。";
 const risk="觀察美國科技股及費半、日韓半導體族群、美元／新台幣方向與國際油價。盤中再以台股成交量、台積電及電子族群強弱確認，勿僅依單一指標追價。";
 return NextResponse.json({status:"ok",date:twDate,generatedAt:new Date().toISOString(),quotes:[us,semi,jp,kr,fx,oil],marketView,asia,currency,risk,method:"根據可取得的市場漲跌與匯率方向自動產生條件式分析；非投顧建議，並非新聞全文摘要。",source:"Yahoo Finance Chart（非官方）"},{headers:{"Cache-Control":"public, s-maxage=60"}});
}

export async function GET(){return cachedResponse("app/api/market/daily-analysis/route.ts",60000,buildResponse);}
