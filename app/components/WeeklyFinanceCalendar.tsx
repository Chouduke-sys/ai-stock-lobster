"use client";
import {useMemo,useState} from "react";
type Event={date:string;market:"台灣"|"美國";title:string;category:"財報"|"經濟數據"|"法說會"|"重大事件";impact:"高"|"中";sector:string;note:string};
const referenceEvents:Event[]=[
{date:"2026-10-26",market:"台灣",title:"台股休市",category:"重大事件",impact:"中",sector:"台灣市場",note:"休市日；請以交易所公告為準"},
{date:"2026-10-27",market:"美國",title:"消費者信心指數",category:"經濟數據",impact:"中",sector:"美股／台股大盤",note:"關注美國消費與市場預期"},
{date:"2026-10-27",market:"台灣",title:"科技企業法說會觀察",category:"法說會",impact:"中",sector:"半導體／電子",note:"個別公司日期須依公開資訊觀測站核對"},
{date:"2026-10-28",market:"美國",title:"科技企業財報週",category:"財報",impact:"高",sector:"AI伺服器／PCB／散熱",note:"各公司公布時間須以投資人關係網站為準"},
{date:"2026-10-28",market:"台灣",title:"電子股法說會觀察",category:"法說會",impact:"中",sector:"半導體／光通訊",note:"以公司公告為準"},
{date:"2026-10-29",market:"美國",title:"聯準會利率決策關注",category:"重大事件",impact:"高",sector:"科技股／匯率／資金流",note:"美國公布日期與台灣時間可能跨日，請核對聯準會日程"},
{date:"2026-10-29",market:"美國",title:"通膨數據與市場利率預期",category:"經濟數據",impact:"高",sector:"半導體／成長股",note:"實際數據公布日須核對美國官方日曆"},
{date:"2026-10-30",market:"美國",title:"大型科技股財報追蹤",category:"財報",impact:"高",sector:"AI伺服器／雲端／記憶體",note:"各企業財報時程以官方公告為準"},
{date:"2026-10-30",market:"台灣",title:"電子股法說會與月末籌碼",category:"法說會",impact:"中",sector:"半導體／PCB",note:"實際法說會時程以公司公告為準"}
];
function taipeiToday(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Taipei"}));}
function ymd(d:Date){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
export default function WeeklyFinanceCalendar(){
 const [filter,setFilter]=useState("全部");const [offset,setOffset]=useState(0);
 const {dates,range}=useMemo(()=>{const now=taipeiToday();const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7+offset*7);const dates=Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return ymd(d);});return {dates,range:dates[0]+" ～ "+dates[4]};},[offset]);
 const events=referenceEvents.filter(e=>dates.includes(e.date)&&(filter==="全部"||filter===e.market||filter===e.category||filter==="高影響"&&e.impact==="高"));
 const featured=events.filter(e=>e.impact==="高").slice(0,3);
 return <section className="lobster-weekly-calendar" aria-label="本週台美財經大事">
 <div className="lobster-calendar-head"><div><h2>🦞 本週台美財經大事</h2><p>聚焦台灣與美國 · 財報、法說會、經濟數據與重大事件</p></div><div className="lobster-week-nav"><button type="button" onClick={()=>setOffset(x=>x-1)} aria-label="上一週">‹</button><strong>{range}</strong><button type="button" onClick={()=>setOffset(x=>x+1)} aria-label="下一週">›</button></div></div>
 <div className="lobster-calendar-tabs">{["全部","台灣","美國","財報","法說會","經濟數據","高影響"].map(f=><button key={f} type="button" className={filter===f?"selected":""} onClick={()=>setFilter(f)}>{f}</button>)}</div>
 <div className="lobster-week-days">{dates.map((date,i)=><div className="lobster-week-day" key={date}><h3>{date.slice(5).replace("-","/")} <small>{["一","二","三","四","五"][i]}</small></h3>{events.filter(e=>e.date===date).length?events.filter(e=>e.date===date).map((e,j)=><article key={j} className={"lobster-week-event "+(e.impact==="高"?"high":"")}><div className="lobster-week-meta"><span>{e.market==="台灣"?"🇹🇼":"🇺🇸"} {e.market}</span><b>{e.impact}影響</b></div><strong>{e.title}</strong><small>{e.category} · {e.sector}</small><p>{e.note}</p></article>):<p className="lobster-week-empty">目前沒有已整理事件</p>}</div>)}</div>
 <div className="lobster-week-bottom"><div><h3>🔥 本週關鍵關注</h3>{featured.length?featured.map((e,i)=><p key={i}><b>{i+1}. {e.title}</b><span>可能影響：{e.sector}</span></p>):<p>本週尚無已核對的高影響事件。</p>}</div><div><h3>🎯 台股觀察方向</h3><p>科技股財報：觀察 AI 伺服器、PCB、散熱及半導體訂單展望。</p><p>美國利率與通膨：留意美元、台幣匯率及外資資金流向。</p><p>台灣法說會：留意公司財測、接單能見度與產業輪動。</p></div></div>
 <p className="lobster-week-disclaimer">※ 本區為功能初版與待核對的事件觀察清單，並非即時官方行事曆；日期、公布時間及事件內容請以主管機關與公司公告為準。未驗證的事件不會標示為已確認。</p>
 </section>;
}
