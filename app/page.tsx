"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CandlestickChart, CircleHelp, Globe2, Landmark, LockKeyhole, Menu, Newspaper, Search, ShieldCheck, TrendingUp, X } from "lucide-react";

type RankRow = { symbol: string; name: string; netShares: number | null; status: "待串接" };
const sampleNames = [
  { symbol: "2330", name: "台積電" },
  { symbol: "2317", name: "鴻海" },
  { symbol: "2454", name: "聯發科" },
  { symbol: "2382", name: "廣達" },
  { symbol: "3711", name: "日月光投控" }
];

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

  const rows: RankRow[] = useMemo(() => (rankSide === "buy" ? sampleNames : [
    { symbol: "—", name: "賣超資料待串接 A" },
    { symbol: "—", name: "賣超資料待串接 B" },
    { symbol: "—", name: "賣超資料待串接 C" },
    { symbol: "—", name: "賣超資料待串接 D" },
    { symbol: "—", name: "賣超資料待串接 E" }
  ]).map((x) => ({ ...x, netShares: null, status: "待串接" as const })), [rankSide]);

  function lookupStock() {
    const value = search.trim();
    if (!/^\d{4,6}$/.test(value)) {
      setMessage("請輸入 4 至 6 位數字股票代號。");
      return;
    }
    setSymbol(value);
    setMessage(`已切換至 ${value}；接通行情服務後才會顯示真實 K 線。`);
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
          <div className="visual-top"><span>MARKET FLOW</span><span className="tag tag-amber">資料服務待連接</span></div>
          <div className="visual-stat"><span>台股加權指數</span><strong>—</strong><small>等待正式行情 API</small></div>
          <div className="sparkline" aria-label="沒有實際數據，暫不顯示走勢圖">
            <div className="spark-grid"></div><div className="spark-empty"><Activity size={24}/><span>連接行情後顯示市場走勢</span></div>
          </div>
          <div className="visual-bottom"><span><i className="dot dot-red"></i> 台股官方資料</span><span><i className="dot dot-blue"></i> 全球行情 API</span></div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><span className="stat-label"><Activity size={16}/> 加權指數</span><strong>—</strong><small>尚未連接行情</small></article>
        <article className="stat-card"><span className="stat-label"><Landmark size={16}/> 三大法人合計</span><strong>—</strong><small>等待官方日報</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowUpRight size={16}/> 買超榜首</span><strong>待更新</strong><small>未驗證排名不顯示</small></article>
        <article className="stat-card"><span className="stat-label"><ArrowDownRight size={16}/> 賣超榜首</span><strong>待更新</strong><small>未驗證排名不顯示</small></article>
      </section>

      <section className="section" id="rankings">
        <div className="section-heading"><div><div className="eyebrow">INSTITUTIONAL FLOW</div><h2>三大法人買賣超排行</h2><p>近五個交易日 · 每日買超與賣超前五名</p></div><span className="tag tag-amber">尚未連接真實資料</span></div>
        <div className="filters">
          <label>市場<select value={market} onChange={e => setMarket(e.target.value)}><option value="all">上市＋上櫃</option><option value="twse">上市股票</option><option value="tpex">上櫃股票</option></select></label>
          <label>法人<select value={investor} onChange={e => setInvestor(e.target.value)}><option value="all">三大法人合計</option><option value="foreign">外資及陸資</option><option value="trust">投信</option><option value="dealer">自營商</option></select></label>
          <div className="toggle-group"><button className={rankSide === "buy" ? "active buy" : ""} onClick={() => setRankSide("buy")}>買超前五</button><button className={rankSide === "sell" ? "active sell" : ""} onClick={() => setRankSide("sell")}>賣超前五</button></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>排名</th><th>股票</th><th>代號</th><th>淨買賣超（股）</th><th>資料狀態</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={`${rankSide}-${i}`}><td><span className="rank-number">{i + 1}</span></td><td className="stock-name">{r.name}</td><td>{r.symbol}</td><td>—</td><td><span className="status-pending">待串接</span></td></tr>)}
        </tbody></table></div>
        <p className="footnote"><CircleHelp size={14}/> 股票名稱為介面測試用例，不代表實際法人排名；正式資料將依淨買賣超股數排序。</p>
      </section>

      <section className="section" id="charts">
        <div className="section-heading"><div><div className="eyebrow">TECHNICAL ANALYSIS</div><h2>個股 K 線分析</h2><p>以歷史 OHLCV 數據繪製日 K、週 K 與月 K。</p></div><CandlestickChart size={26} className="heading-icon"/></div>
        <div className="chart-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入股票代號，例如 2330" onKeyDown={e => e.key === "Enter" && lookupStock()}/><button onClick={lookupStock}>查詢</button></div><div className="toggle-group">{["日K","週K","月K"].map(p => <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}</button>)}</div></div>
        <div className="chart-card"><div className="chart-title"><div><strong>{symbol}</strong><span> · {period}</span></div><span className="tag tag-amber">OHLCV 尚未載入</span></div><div className="chart-placeholder"><BarChart3 size={30}/><strong>等待真實 K 線資料</strong><span>接通官方或授權行情 API 後，顯示開盤、最高、最低、收盤與成交量。</span></div><div className="indicator-grid"><div><small>MA5</small><strong>—</strong></div><div><small>RSI</small><strong>—</strong></div><div><small>成交量</small><strong>—</strong></div><div><small>最後更新</small><strong>—</strong></div></div></div>
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

      <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><TrendingUp size={20}/></span><span><strong>AI股市龍蝦</strong><small>AI STOCK INTELLIGENCE</small></span></a><p>本網站為開發測試版。行情、新聞、法人排名與 AI 分析功能尚未連接正式資料來源，內容不構成投資建議。</p><span>© {new Date().getFullYear()} AI股市龍蝦</span></footer>
    </main>
  );
}
