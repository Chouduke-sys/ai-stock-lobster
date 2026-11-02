"use client";
import {useEffect,useState} from "react";
import {parseWatchlist,researchText,type WatchItem,type ResearchBar} from "../../lib/pro-research";
import type {proResearch} from "../../lib/pro-data";
type Research=Awaited<ReturnType<typeof proResearch>>;
const decimal=(value:number|null|undefined,digits=2)=>typeof value==="number"&&Number.isFinite(value)?value.toLocaleString("zh-TW",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
const percent=(value:number|null|undefined)=>typeof value==="number"?(value>0?"+":"")+decimal(value)+"%":"—";
const tone=(value:number|null|undefined)=>typeof value!=="number"?"":value>0?"pro-up":value<0?"pro-down":"";

function PriceChart({bars,name}:{bars:ResearchBar[];name:string}){
 if(bars.length<2)return <p className="pro-empty">尚無足夠有效收盤資料可繪製走勢。</p>;
 const values=bars.slice(-60),low=Math.min(...values.map(b=>b.close)),high=Math.max(...values.map(b=>b.close));
 const points=values.map((b,i)=>`${64+i*632/(values.length-1)},${170-(b.close-low)/Math.max(1,high-low)*136}`).join(" ");
 const color=values.at(-1)!.close>=values[0].close?"#fb7969":"#59d7a1";
 return <figure className="pro-price-chart"><svg viewBox="0 0 720 205" role="img" aria-label={`${name}有效日收盤走勢，${values[0].date}至${values.at(-1)!.date}，區間最低${decimal(low)}元，最高${decimal(high)}元`}>
  {[34,102,170].map((y,i)=><g key={y}><line x1="64" x2="696" y1={y} y2={y} stroke="#29405a" strokeDasharray="4 5"/><text x="4" y={y+4} fill="#91a7c2" fontSize="11">{decimal(high-(high-low)*i/2)}</text></g>)}
  <polyline points={points} stroke={color} fill="none" strokeWidth="2.5" strokeLinejoin="round"/>
  <text x="64" y="197" fill="#91a7c2" fontSize="11">{values[0].date}</text><text x="696" y="197" textAnchor="end" fill="#91a7c2" fontSize="11">{values.at(-1)!.date}</text>
 </svg><figcaption>日收盤價 · 元 · 局部縮放，未還原除權息</figcaption></figure>;
}

export default function ProWorkspace({accountKey}:{accountKey:string}){
 const [watchlist,setWatchlist]=useState<WatchItem[]>([]),[ready,setReady]=useState(false),[storageError,setStorageError]=useState("");
 const [symbol,setSymbol]=useState("2330"),[input,setInput]=useState("2330"),[lookback,setLookback]=useState(5),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState<Research|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[expired,setExpired]=useState(false);
 const [notice,setNotice]=useState("");
 const storageKey="lobster-pro-watchlist-v1:"+accountKey;
 useEffect(()=>{
  try{setWatchlist(parseWatchlist(localStorage.getItem(storageKey)));}catch{setStorageError("此瀏覽器無法讀取自選清單，追蹤內容只會保留在本次畫面。");}
  setReady(true);
 },[storageKey]);
 useEffect(()=>{
  if(!ready)return;
  try{localStorage.setItem(storageKey,JSON.stringify(watchlist));}catch{setStorageError("此瀏覽器無法儲存自選清單，關閉後可能遺失。");}
 },[watchlist,ready,storageKey]);
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  setLoading(true);setData(null);setError("");setNotice("");
  (async()=>{
   try{
    const response=await fetch(`/api/pro/research?symbol=${symbol}&window=${lookback}`,{cache:"no-store",signal:controller.signal});
    const payload=await response.json();
    if(!active)return;
    if(response.status===401){setExpired(true);setData(null);throw Error("登入已失效，請重新登入。");}
    if(!response.ok||payload.status!=="ok")throw Error(payload.error??"無法取得研究資料。");
    setData(payload);
   }catch(e){if(active&&!controller.signal.aborted)setError(e instanceof Error?e.message:"無法取得研究資料。");}
   finally{if(active)setLoading(false);}
  })();
  return ()=>{active=false;controller.abort();};
 },[symbol,lookback,refresh]);
 const tracked=watchlist.find(item=>item.symbol===symbol);
 const analysis=data?.analysis;
 const select=(code:string)=>{setSymbol(code);setInput(code);};
 const toggleTracking=()=>{
  if(tracked){setWatchlist(items=>items.filter(item=>item.symbol!==symbol));setNotice("已從此瀏覽器的自選清單移除。");return;}
  if(!data?.analysis?.bars.length){setNotice("取得有效個股資料後才能加入追蹤。");return;}
  if(watchlist.length>=20){setNotice("最多追蹤 20 檔，請先移除一檔。");return;}
  setWatchlist(items=>[...items,{symbol,name:data.name,note:""}]);setNotice("已加入自選追蹤。");
 };
 const exportResearch=()=>{
  if(!data?.analysis||!data.source)return;
  const note=tracked?.note?"\n\n我的筆記：\n"+tracked.note:"";
  const url=URL.createObjectURL(new Blob([researchText(data.name,symbol,data.analysis,data.source)+note],{type:"text/plain;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=`lobster-research-${symbol}-${data.analysis.date}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 if(expired)return <section className="pro-gate"><h2>請重新登入</h2><p role="alert">{error}</p><a className="pro-button" href="/?login=1">前往會員登入</a></section>;
 return <>
  <div className="pro-layout">
   <aside className="pro-panel pro-watchlist"><div className="pro-panel-title"><div><span className="pro-kicker">WATCHLIST</span><h2>我的自選股</h2></div><span>{watchlist.length} / 20</span></div>
    <form onSubmit={event=>{event.preventDefault();if(/^\d{4}$/.test(input.trim()))select(input.trim());else setNotice("請輸入四碼上市或上櫃股票代號。");}} className="pro-search"><label htmlFor="pro-stock-symbol">股票代號</label><div><input id="pro-stock-symbol" inputMode="numeric" maxLength={4} value={input} onChange={event=>setInput(event.target.value)} placeholder="例如 2330"/><button type="submit">研究</button></div></form>
    {watchlist.length?<ul className="pro-watch-items">{watchlist.map(item=><li key={item.symbol}><button type="button" aria-pressed={symbol===item.symbol} onClick={()=>select(item.symbol)}><span>{item.name}<small>{item.symbol}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>:<p className="pro-empty">選擇股票後點「加入追蹤」，建立自己的研究清單。</p>}
    <div className="pro-quick-picks"><span>快速研究</span>{[{symbol:"2330",name:"台積電"},{symbol:"2308",name:"台達電"},{symbol:"6274",name:"台燿"}].map(item=><button type="button" key={item.symbol} onClick={()=>select(item.symbol)}>{item.name} <small>{item.symbol}</small></button>)}</div>
    <p className="pro-small">清單與筆記僅儲存在目前瀏覽器，依登入帳號分開保存；尚未提供跨裝置同步。</p>{storageError&&<p className="pro-message" role="status">{storageError}</p>}
   </aside>
   <section className="pro-panel pro-stock" aria-busy={loading} aria-label="個股研究">
    <div className="pro-panel-title"><div><span className="pro-kicker">STOCK RESEARCH</span><h2>{data?.name??symbol} <small>{symbol}</small></h2></div><div className="pro-actions"><button type="button" className="pro-button pro-secondary" onClick={()=>setRefresh(value=>value+1)} disabled={loading}>重新整理</button><button type="button" className="pro-button" onClick={toggleTracking} disabled={loading||!ready||!analysis?.bars.length}>{tracked?"移除追蹤":"＋ 加入追蹤"}</button></div></div>
    {loading?<p role="status" className="pro-empty">正在整理 {symbol} 的歷史行情與產業資料…</p>:error?<div className="pro-message" role="alert">{error}<button type="button" onClick={()=>setRefresh(value=>value+1)}>再試一次</button></div>:analysis?<>
     <p className="pro-small">資料日 {analysis.date} · {data?.source} · {analysis.sampleDays} 個有效日收盤樣本</p>
     <div className="pro-metrics"><div><span>最近收盤</span><strong>{decimal(analysis.close)}<small> 元</small></strong></div><div><span>近 5 個樣本變動</span><strong className={tone(analysis.change5)}>{percent(analysis.change5)}</strong></div><div><span>近 20 個樣本變動</span><strong className={tone(analysis.change20)}>{percent(analysis.change20)}</strong></div><div><span>RSI14</span><strong>{decimal(analysis.rsi14,1)}</strong></div></div>
     <PriceChart bars={analysis.bars} name={data!.name}/>
     <div className="pro-indicators"><div><span>MA5</span><strong>{decimal(analysis.ma5)}</strong></div><div><span>MA20</span><strong>{decimal(analysis.ma20)}</strong></div><div><span>相較前五日均量</span><strong>{decimal(analysis.volumeRatio)} 倍</strong></div></div>
     <p className="pro-small">價格與漲跌採有效日收盤樣本；遇休市或停牌，日期間隔可能不同。RSI 依目前可取得樣本計算，可能與使用更長歷史的平台不同。</p>
    </>:<p className="pro-empty">目前無法取得這檔股票的有效日收盤資料。請核對代號或稍後再試；產業比較仍可使用。</p>}
    {notice&&<p className="pro-message" role="status">{notice}</p>}
   </section>
  </div>
  <div className="pro-research-grid">
   <section className="pro-panel"><div className="pro-panel-title"><div><span className="pro-kicker">RESEARCH BRIEF</span><h2>研究摘要</h2></div><button type="button" className="pro-button pro-secondary" disabled={!analysis||loading} onClick={exportResearch}>匯出文字</button></div>
    <p className="pro-small">依實際數據與固定規則整理，未使用生成式 AI 預測。</p>
    {analysis?<ul className="pro-brief">{analysis.summary.map(line=><li key={line}>{line}</li>)}</ul>:<p className="pro-empty">取得有效個股資料後，將顯示可核對的研究重點。</p>}
    <label className="pro-note-label" htmlFor="pro-note">我的研究筆記 <small>{tracked?`${tracked.note.length} / 500`:"加入追蹤後可編輯"}</small></label><textarea id="pro-note" value={tracked?.note??""} maxLength={500} disabled={!tracked||!ready} placeholder="記下觀察原因、關注事件與待確認問題…" onChange={event=>setWatchlist(items=>items.map(item=>item.symbol===symbol?{...item,note:event.target.value}:item))}/>
   </section>
   <section className="pro-panel"><div className="pro-panel-title"><div><span className="pro-kicker">SECTOR COMPARISON</span><h2>產業熱度比較</h2></div><label className="pro-period">比較區間<select aria-label="產業比較區間" value={lookback} onChange={event=>setLookback(Number(event.target.value))}><option value={5}>前 5 個交易日</option><option value={10}>前 10 個交易日</option><option value={20}>前 20 個交易日</option></select></label></div>
    <p className="pro-small">資料日 {data?.sectorDate??"—"} · 最新成交金額相較前 {lookback} 個已驗證交易日均值 · 14 個研究族群</p>
    <div className="pro-table-wrap"><table><caption className="pro-sr-only">產業成交金額與所選區間比較，單位億元</caption><thead><tr><th>族群</th><th>最新金額</th><th>區間均值</th><th>增減</th></tr></thead><tbody>{data?.sectors.map(sector=><tr key={sector.name}><td>{sector.name}</td><td>{sector.amount===null?"—":decimal(sector.amount/1e8,1)}</td><td>{sector.average===null?"—":decimal(sector.average/1e8,1)}</td><td className={tone(sector.delta)}>{sector.delta===null?"樣本不足":(sector.delta>0?"+":"")+decimal(sector.delta/1e8,1)}</td></tr>)}</tbody></table></div>
    {!data&&<p className="pro-empty">{loading?"正在取得產業歷史…":"產業資料暫不可用，請重試。"}</p>}
    <p className="pro-small">單位：億元。成分股可重疊，金額不可加總；成交熱度並非淨資金流入。{data?.method}</p>
   </section>
  </div>
 </>;
}
