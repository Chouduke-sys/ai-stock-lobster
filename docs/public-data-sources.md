# 公開資料來源與備援

## 原則

以已驗證的公開來源優先，交易所保留為補充與最後備援。來源按資料種類各自選取；一個網站可讀取，不代表所有 API、全市場資料或即時 feed 都可匿名使用。

每個 adapter 必須核對資料日期、商品、市場、數量／金額單位與涵蓋範圍。不得把分項前百名相加冒充三大法人全市場排行，不得把上一期改標成今天，不以零填未知資料。

## 已接入

| 類型 | 優先來源 | 補充／備援 |
| --- | --- | --- |
| 加權指數報價 | Yahoo Finance 具時間報價 | TWSE MIS |
| 已完成收盤 | Yahoo Finance 已完成交易時段 | TWSE 收盤及成交統計補充 |
| 交易日 | FinMind TaiwanStockTradingDate | TWSE 休市表與已完成交易日 |
| 法人總金額 | FinMind / HiStock，優先較新的具日期資料 | TWSE BFI82U |
| 融資融券 | FinMind / HiStock / Yahoo，採可驗證公布日期 | TWSE MI_MARGN |
| 外資台指期淨口數 | FinMind TX 未平倉口數 | TAIFEX；P/C 仍採玩股網或 TAIFEX |
| 外資／投信／自營商個股排行 | Yahoo 公開具日期分類排行；有適當權限可用 FinMind 全市場明細 | TWSE / TPEx |
| 三大法人合計個股排行 | 有適當權限的 FinMind 全市場明細 | TWSE / TPEx；不以分項前百名偽造合計排行 |
| 產業成交熱度 | HiStock / Yahoo | TWSE 完整資料補齊與歷史 |

官方來源只在沒有適用公開資料或需要官方才提供的完整欄位時使用。歷史產業成交金額、完整成交統計及部分選擇權資料仍可能使用交易所；沒有等價資料時不偽造替代品。

## FinMind 設定及限制

- 交易日、整體法人、整體融資融券與指定 TX 的法人部位使用文件所列公開資料集。
- 全市場個股法人明細需要合適的會員方案，不把免費 token 當作完整授權。維護者自行於伺服器環境設定 FINMIND_API_TOKEN，並在確認方案允許後設定 FINMIND_MARKET_WIDE=1。
- token 僅放 Authorization header，不能放 NEXT_PUBLIC_、回應內容或日誌。
- 整體資料快取兩分鐘，交易日／代號清單快取一小時，併發請求共用結果。收到 429 暫停該來源十五分鐘，立即允許其他來源接手；不換 IP 或繞過限額。
- 快取及熔斷屬目前執行個體；跨執行個體另有 Next.js fetch cache。這不是全域配額保證，需依實際流量觀測。

## 日期、精度及完整性

- 排行允許上一個已確認交易日的已公布資料，標示 publicationPending；不再因當日收盤先公布，就拒絕上一期仍有效的法人日報。
- 上市與上櫃合併時仍要求同日資料；無共同日期時不混合。
- Yahoo 公開排行以張顯示。換算為股時保留 precision=published_lots，畫面明示來源張數精度，並非逐股明細。
- TWSE／TPEx 的外資自營商須納入正確的外資合計口徑，避免錯誤加總驗證把有效資料丟棄。
- 指數收盤的公開價與官方成交統計僅在同日期時補齊；統計缺值保持 null。

## 來源目錄與健康

GET /api/market/sources 提供已實作來源、資料種類、優先序與目前個體的近期觀測；不回傳任何金鑰。

GET /api/market/source-health 分別檢查公開資料與官方備援。備援故障不代表其他有效來源也失效；來源存在不代表所有欄位、即時性或授權均已確認。

## 本次只讀驗證

- FinMind：交易日、法人總額、融資融券、TX 法人資料可匿名讀取並通過實際 schema 核對。
- Yahoo：外資／投信／自營商公開排行可讀取；核對日期、買賣張數及市場代碼。
- 玩股網：公開網頁可讀，但本次其動態 JSON 端點回 400，未列作新啟用的免登入排行 API。
- 券商頁面：部分分類可讀、部分查無資料，未把未驗證分類當成全市場法人合計。
- 實際下載樣本僅存於忽略的 source-probes/，不提交完整第三方頁面或行情；回歸測試使用合成資料。

## 後續擴充

新增公開 API 時，在 lib/provider-policy.ts 登記能力及優先序，新增對應 adapter 與日期／單位／缺值／限流測試，再接到對應資料種類。API key、付費權限或未公開端點不會自動取得或繞過。

官方文件：
- https://finmind.github.io/quickstart/
- https://finmind.github.io/tutor/TaiwanMarket/Chip/
- https://finmind.github.io/tutor/TaiwanMarket/Derivative/
