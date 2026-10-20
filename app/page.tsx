"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, CircleHelp, Globe2, Landmark, LockKeyhole, Menu, Newspaper, Search, ShieldCheck, TrendingUp, X } from "lucide-react";

type RankRow = { symbol: string; name: string; netShares: number };
type HistoryRow = { date:string; open:number; high:number; low:number; close:number; volume:number; ma5:number|null; ma10:number|null; ma20:number|null; ma60:number|null; rsi14:number|null; dif:number|null; signal:number|null; histogram:number|null };
type HistoryResult = { status:string; symbol:string; period:string; asOf:string; candles:HistoryRow[]; dataSource:string };
type TaiexResult = { status: string; date: string | null; value: number | null; change: number | null; changePercent: number | null; delaySeconds?: number | null; recent: { date: string | null; value: number | null }[] };
type StockResult = {
  status: string;
  symbol: string;
  name: string | null;
  dataDate: string | null;
  quote: { open: number | null; high: number | null; low: number | null; close: number | null; change: number | null; volume: number | null; tradeValue: number | null; transactions: number | null };
  dataSource: string;
  lastUpdatedAt: string;
  isRealtime: boolean;
  delaySeconds?: number | null;
};
const formatPrice = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const ageLabel = (s: number | null | undefined) => s == null ? "報價時間未確認" : s < 60 ? `距報價 ${s} 秒` : `距報價 ${Math.floor(s / 60)} 分鐘`;
const formatVolume = (value: number | null | undefined) => value == null ? "—" : Math.round(value).toLocaleString("zh-TW");
const chartPeriod: Record<string,string> = { "日K":"day", "週K":"week", "月K":"month" };

export default function Home() {
  const [rankSide, setRankSide] = useState<"buy" | "sell">("buy");
  const [market, setMarket] = useState("all");
  const [investor, setInvestor] = useState("all");
  const [period, setPeriod] = useState("日K");
  const [symbol, setSymbol] = useState("2330");
  const [search, setSearch] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [stockData, setStockData] = useState<StockResult | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [taiex, setTaiex] = useState<TaiexResult | null>(null);
  const [taiexError, setTaiexError] = useState("");
  const [loadingTaiex, setLoadingTaiex] = useState(true);
  const [rankRows, setRankRows] = useState<RankRow[]>([]);
  const [rankError, setRankError] = useState("");
  const [rankDate, setRankDate] = useState("");
  const [loadingRank, setLoadingRank] = useState(true);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const rows = rankRows;

  useEffect(() => {
    const controller = new AbortController();
    async function loadRanks() {
      setLoadingRank(true); setRankError(""); setRankRows([]);
      try {
        const params = new URLSearchParams({market,investor,side:rankSide});
        const response = await fetch(`/api/institutional?${params}`,{signal:controller.signal});
        const data = await response.json();
        if(!response.ok || data.status!=="ok")throw new Error(data.error || "法人排行暫無資料");
        setRankRows(data.rows);setRankDate(data.dataDate);
      }catch(e){if(!controller.signal.aborted)setRankError(e instanceof Error?e.message:"法人排行讀取失敗");}
      finally{if(!controller.signal.aborted)setLoadingRank(false);}
    }
    void loadRanks();
    return ()=>controller.abort();
  },[market,investor,rankSide]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadHistory() {
      setLoadingHistory(true);setHistoryError("");setHistory(null);
      try {
        const response = await fetch(`/api/stocks/${symbol}/history?period=${chartPeriod[period]}`,{signal:controller.signal});
        const data = await response.json();
        if(!response.ok || data.status!=="ok")throw new Error(data.error || "K 線資料暫無法取得");
        setHistory(data);
      }catch(e){if(!controller.signal.aborted)setHistoryError(e instanceof Error?e.message:"K 線資料讀取失敗");}
      finally{if(!controller.signal.aborted)setLoadingHistory(false);}
    }
    void loadHistory();
    return ()=>controller.abort();
  },[symbol,period]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadQuote() {
      setLoadingQuote(true);
      setQuoteError("");
      setStockData(null);
      try {
        const response = await fetch(`/api/stocks/${symbol}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || result.status !== "ok") {
          throw new Error(result.error || "行情查詢失敗");
        }
        setStockData(result as StockResult);
      } catch (error) {
        if (!controller.signal.aborted) {
          setQuoteError(error instanceof Error ? error.message : "行情查詢失敗");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingQuote(false);
      }
    }
    void loadQuote();
    const timer = setInterval(() => { void loadQuote(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadIndex() {
      try {
        const response = await fetch("/api/market/taiex", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || result.status !== "ok") throw new Error(result.error || "加權指數查詢失敗");
        setTaiex(result as TaiexResult);
      } catch (error) {
        if (!controller.signal.aborted) setTaiexError(error instanceof Error ? error.message : "加權指數查詢失敗");
      } finally {
        if (!controller.signal.aborted) setLoadingTaiex(false);
      }
    }
    void loadIndex();
    const timer = setInterval(() => { void loadIndex(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  function lookupStock() {
    const value = search.trim();
    if (!/^\d{4,6}$/.test(value)) {
      setMessage("請輸入 4 至 6 位數字股票代號。");
      return;
    }
    setSymbol(value);
    setMessage("");
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="AI股市龍蝦首頁">
          <span className="brand-mark"><TrendingUp size={24} /></span>
          <span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE · TAIWAN</small></span>
        </a>
        <nav className="nav-links"><a href="#rankings">法人排行</a><a href="#charts">個股 K 線</a><a href="#global">全球資訊</a><a href="#membership">會員方案</a></nav>
        <button className="btn btn-outline login-btn" onClick={() => setShowLogin(!showLogin)}><LockKeyhole size={16}/> 會員登入</button>
        <button className="icon-btn mobile-menu" aria-label="開啟登入面板" onClick={() => setShowLogin(!showLogin)}><Menu size={20}/></button>
      </header>

      {showLogin && <section className="modal-card">
        <button className="close-btn" onClick={() => setShowLogin(false)} aria-label="關閉"><X size={18}/></button>
        <h2>會員登入</h2><p>此專案目前尚未串接真實會員驗證。</p>
        <label>電子郵件<input type="email" placeholder="you@example.com" autoComplete="email"/></label>
        <label>密碼<input type="password" placeholder="輸入密碼" autoComplete="current-password"/></label>
        <button className="btn btn-primary" onClick={() => setMessage("登入功能尚未啟用：請先設定正式驗證服務。")}>登入</button>
      </section>}

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot"></span> MARKET INTELLIGENCE PLATFORM</div>
          <h1>看懂法人資金，<br/><span>掌握市場脈動。</span></h1>
          <p>整合台股法人動向、個股 K 線與全球市場資訊，為你的投資研究建立清晰的數據視野。</p>
          <div className="hero-actions"><a className="btn btn-primary" href="#rankings">查看法人排行 <ArrowUpRight size={16}/></a><a className="btn btn-outline" href="#charts">探索個股圖表</a></div>
          <div className="trust-line"><ShieldCheck size={15}/> 資料來源與更新時間透明標示</div>
        </div>
        <div className="hero-visual">
          <div className="visual-top"><span>MARKET FLOW</span><span className="tag tag-amber">{taiex ? "證交所每日收盤資料" : loadingTaiex ? "載入中" : "暫無資料"}</span></div>
          <div className="visual-stat"><span>台股加權指數</span><strong>{formatPrice(taiex?.value)}</strong><small>{taiex ? `${taiex.date ?? "日期未提供"} · 漲跌 ${formatPrice(taiex.change)} 點（${formatPrice(taiex.changePercent)}%）· ${ageLabel(taiex.delaySeconds)} · 不保證即時` : loadingTaiex ? "載入官方日行情中…" : taiexError}</small></div>
          <div className="sparkline" aria-label="沒有實際數據，暫不顯示走勢圖">
            <div className="spark-grid"></div>
            {taiex && taiex.recent.filter(p => p.value !== null).length >= 2 ? (() => {
              const values = taiex.recent.filter((p): p is { date: string | null; value: number } => p.value !== null).map(p => p.value);
              const low = Math.min(...values), high = Math.max(...values);
              const range = Math.max(high - low, 1);
              const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1) * 100).toFixed(2)},${(90 - (v - low) / range * 80).toFixed(2)}`).join(" ");
              return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:"relative",width:"100%",height:"100%"}} role="img" aria-label="近期收盤走勢折線圖"><polyline points={points} fill="none" stroke="#fb725b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
            })() : <div className="spark-empty"><Activity size={24}/><span>{loadingTaiex ? "讀取走勢中" : "暫無可繪製的走勢資料"}</span></div>}
          </div>
          <div className="visual-bottom"><span><i className="dot dot-red"></i> 台股官方資料</span><span><i className="dot dot-blue"></i> 全球行情 API</span></div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><span className="stat-label"><Activity size={16}/> 加權指數</span><strong>{formatPrice(taiex?.value)}</strong><small>{taiex ? `${taiex.date ?? "日期未提供"} · ${formatPrice(taiex.change)} 點（${ageLabel(taiex.delaySeconds)}）` : loadingTaiex ? "載入中" : taiexError || "暫無資料"}</small></article>
        <article className="stat-card"><span className="stat-label"><Landmark size={16}/> 三大法人合計</span><strong>—</strong><small>等待官方日報</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowUpRight size={16}/> 買超榜首</span><strong>待更新</strong><small>未驗證排名不顯示</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowDownRight size={16}/> 賣超榜首</span><strong>待更新</strong><small>未驗證排名不顯示</small></article>
      </section>

      <section className="section" id="rankings">
        <div className="section-heading"><div><div className="eyebrow">INSTITUTIONAL FLOW</div><h2>三大法人買賣超排行</h2><p>當日買超與賣超前五名 · 盤後公布</p></div><span className="tag tag-amber">{rankDate && rows.length ? `資料日 ${rankDate}` : loadingRank ? "讀取中" : "今日資料尚未確認"}</span></div>
        <div className="filters">
          <label>市場<select value={market} onChange={e => setMarket(e.target.value)}><option value="all">上市＋上櫃（開發中）</option><option value="twse">上市股票</option><option value="tpex">上櫃股票（開發中）</option></select></label>
          <label>法人<select value={investor} onChange={e => setInvestor(e.target.value)}><option value="all">三大法人合計</option><option value="foreign">外資及陸資</option><option value="trust">投信</option><option value="dealer">自營商</option></select></label>
          <div className="toggle-group"><button className={rankSide === "buy" ? "active buy" : ""} onClick={() => setRankSide("buy")}>買超前五</button><button className={rankSide === "sell" ? "active sell" : ""} onClick={() => setRankSide("sell")}>賣超前五</button></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>排名</th><th>股票</th><th>代號</th><th>淨買賣超（股）</th><th>資料狀態</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={`${rankSide}-${i}`}><td><span className="rank-number">{i + 1}</span></td><td className="stock-name">{r.name}</td><td>{r.symbol}</td><td>{formatVolume(r.netShares)}</td><td>TWSE</td></tr>)}
        </tbody></table></div>
        <p className="footnote"><CircleHelp size={14}/> {loadingRank ? "正在讀取法人日報…" : rankError || `資料日期 ${rankDate}；依淨買賣超股數排序。上櫃資料尚未完成。`}</p>
      </section>

      <section className="section" id="charts">
        <div className="section-heading"><div><div className="eyebrow">TECHNICAL ANALYSIS</div><h2>個股行情查詢</h2><p>上市盤中報價每 15 秒查詢；歷史 K 線及技術指標以實際歷史行情計算。</p></div><CandlestickChart size={26} className="heading-icon"/></div>
        <div className="chart-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入股票代號，例如 2330" onKeyDown={e => e.key === "Enter" && lookupStock()}/><button onClick={lookupStock}>查詢</button></div><div className="toggle-group">{["日K","週K","月K"].map(p => <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}</button>)}</div></div>
        <div className="chart-card"><div className="chart-title"><div><strong>{symbol}{stockData?.name ? ` · ${stockData.name}` : ""}</strong><span> · 盤中報價</span></div><span className="tag tag-amber">{loadingQuote ? "查詢中" : stockData ? "盤中行情（測試）" : "尚無資料"}</span></div>
        {stockData ? (
          <>
            <div className="quote-summary"><div><small>最新成交價（元）</small><strong>{formatPrice(stockData.quote.close)}</strong></div><div><small>當日漲跌（元）</small><strong>{formatPrice(stockData.quote.change)}</strong></div><div><small>資料交易日</small><strong>{stockData.dataDate ?? "官方未提供"}</strong></div></div>
            <div className="indicator-grid"><div><small>開盤</small><strong>{formatPrice(stockData.quote.open)}</strong></div><div><small>最高</small><strong>{formatPrice(stockData.quote.high)}</strong></div><div><small>最低</small><strong>{formatPrice(stockData.quote.low)}</strong></div><div><small>成交量（股）</small><strong>{formatVolume(stockData.quote.volume)}</strong></div></div>
            <p className="footnote">來源：{stockData.dataSource}；查詢時間：{new Date(stockData.lastUpdatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台灣時間）。{ageLabel(stockData.delaySeconds)}，每 15 秒查詢，不保證即時。</p>
          </>
        ) : <div className="chart-placeholder"><BarChart3 size={30}/><strong>{loadingQuote ? "正在讀取證交所資料…" : quoteError || "尚無行情資料"}</strong><span>目前僅支援上市股票日行情，上櫃股票與歷史 K 線尚未接通。</span></div>}
        <div className="history-panel">
          <h3>{period} 歷史 K 線與技術指標</h3>
          {history?.candles.length ? (() => {
            const data = history.candles.slice(-65);
            const low = Math.min(...data.map(c=>c.low)), high = Math.max(...data.map(c=>c.high)), range=Math.max(1,high-low);
            const x=(i:number)=>(i+.5)*800/data.length;
            const y=(v:number)=>20+(high-v)/range*240;
            const latest=history.candles[history.candles.length-1];
            return <>
              <svg viewBox="0 0 800 290" role="img" aria-label={`${symbol} ${period} 真實歷史 K 線圖`} className="candle-svg">
                {data.map((c,i)=><g key={c.date} stroke={c.close>=c.open?"#fb725b":"#59d7a1"}>
                  <line x1={x(i)} y1={y(c.high)} x2={x(i)} y2={y(c.low)} strokeWidth="1.4"/>
                  <rect x={x(i)-Math.max(2,320/data.length)} y={Math.min(y(c.open),y(c.close))} width={Math.max(4,640/data.length)} height={Math.max(1,Math.abs(y(c.open)-y(c.close)))} fill={c.close>=c.open?"#fb725b":"#59d7a1"} />
                </g>)}
                {(["ma5","ma10","ma20"] as const).map((key,i)=>{
                  const points=data.map((c,j)=>c[key]===null?null:`${x(j)},${y(c[key]!)}`).filter(Boolean).join(" ");
                  return <polyline key={key} points={points} fill="none" stroke={["#f7c66b","#7aa7ff","#c39bfa"][i]} strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>;
                })}
              </svg>
              <div className="indicator-grid">
                <div><small>MA5 / MA10</small><strong>{formatPrice(latest.ma5)} / {formatPrice(latest.ma10)}</strong></div>
                <div><small>MA20 / MA60</small><strong>{formatPrice(latest.ma20)} / {formatPrice(latest.ma60)}</strong></div>
                <div><small>RSI(14)</small><strong>{formatPrice(latest.rsi14)}</strong></div>
                <div><small>MACD (DIF / Signal / Histogram)</small><strong>{formatPrice(latest.dif)} / {formatPrice(latest.signal)} / {formatPrice(latest.histogram)}</strong></div>
              </div>
              <p className="footnote">來源：{history.dataSource}；最新歷史交易日：{history.asOf}。紅色上漲、綠色下跌；MA5 黃、MA10 藍、MA20 紫。非盤中即時 K 線，週月 K 為日線彙整。</p>
            </>;
          })() : <p className="footnote">{loadingHistory ? "歷史行情讀取中…" : historyError || "目前沒有歷史行情"}</p>}
        </div></div>
        {message && <div className="notice" role="status">{message}</div>}
      </section>

      <section className="section" id="global">
        <div className="section-heading"><div><div className="eyebrow">GLOBAL INTELLIGENCE</div><h2>全球財經資訊</h2><p>全球指數、匯率、科技產業新聞與重要事件。</p></div><Globe2 size={26} className="heading-icon"/></div>
        <div className="news-grid">
          <article className="news-card"><span className="news-icon"><Globe2 size={19}/></span><div><strong>全球主要指數</strong><p>追蹤 S&P 500、NASDAQ、道瓊、日經與韓國 KOSPI。</p><small>全球行情 API 待設定</small></div></article>
          <article className="news-card"><span className="news-icon"><Newspaper size={19}/></span><div><strong>AI 與半導體</strong><p>整理 AI 伺服器、晶片、供應鏈與科技巨頭動態。</p><small>新聞來源待設定</small></div></article>
          <article className="news-card"><span className="news-icon"><Activity size={19}/></span><div><strong>匯率與大宗商品</strong><p>追蹤美元指數、台幣、黃金與原油等市場資訊。</p><small>行情來源待設定</small></div></article>
        </div>
      </section>

      <section className="membership" id="membership"><div><div className="eyebrow">MEMBERSHIP</div><h2>從基本資訊，到進階研究工具。</h2><p>規劃免費基本版與 Pro 會員方案。實際收費與付費權限需待金流和會員系統完成後啟用。</p></div><button className="btn btn-primary" onClick={() => setShowPlan(!showPlan)}>查看會員方案 <ArrowUpRight size={16}/></button>
        {showPlan && <div className="plan-detail"><h3>Pro 會員（規劃中）</h3><p>進階歷史排行、個股追蹤、技術指標與 AI 研究摘要。</p><span className="tag tag-amber">尚未開放訂閱或收款</span></div>}
      </section>

      <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><TrendingUp size={20}/></span><span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE</small></span></a><p>本網站為開發測試版。盤中行情與歷史技術分析均為測試功能；上櫃、新聞、部分法人資料及 AI 分析尚未完整串接，內容不構成投資建議。</p><span>© {new Date().getFullYear()} AI股市龍蝦</span></footer>
    </main>
  );
}
