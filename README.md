# AI股市龍蝦 — 可獨立執行的前端專案

這是一個 Next.js + TypeScript 的網站起始專案，包含響應式首頁、法人排行互動介面、股票代號查詢 UI、K 線區塊、全球市場資訊區塊及會員方案展示。

## 重要狀態聲明

- 此專案**尚未部署**，不含正式網站網址。
- 尚未接入 TWSE、TPEx 或全球行情供應商。
- API 路由目前會回傳 `503 not_configured` 和空資料；這是刻意設計，避免把示意數字誤當成真實行情。
- 登入、管理後台、付款與 Pro 權限尚未實作。
- 不可在正式營運前直接宣稱行情為即時或可供付費會員使用。

## 本機執行

需要 Node.js 20 LTS 或相容版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟 http://localhost:3000

正式建置測試：

```bash
npm run build
npm start
```

## 目前可運作的部分

- 桌機與手機版響應式首頁。
- 法人買超／賣超介面切換。
- 上市／上櫃與法人篩選 UI。
- 股票代號輸入及 K 線週期切換 UI。
- 會員登入與 Pro 方案的展示介面。
- SEO title、description 基礎 metadata。
- 後端 API 路由骨架；未設定資料來源時會明確回報未設定。

## 下一階段：真實資料接入

### 台股官方資料

1. 從 TWSE OpenAPI 文件確認上市法人買賣超日報與歷史行情端點。
2. 從 TPEx OpenAPI 文件確認上櫃法人交易資料與歷史行情端點。
3. 寫入 `lib/providers/twse.ts`、`lib/providers/tpex.ts` adapter。
4. 依日期與股票代號正規化欄位，統一股數、法人分類、交易日及更新時間。
5. 建立 PostgreSQL 資料表保存歷史快照，使用交易日曆產生近五個交易日。
6. 以 `netShares = buyShares - sellShares` 排序買超前五與賣超前五。
7. 加入資料來源、資料時間、重試、錯誤監控與快取。
8. 確認資料使用條款與商業展示授權。

### 全球行情與新聞

- 選擇有商業展示授權的行情供應商。
- 以 server-side adapter 呼叫供應商，API key 僅放在伺服器環境變數。
- 確認交易所、延遲等級、歷史資料覆蓋、新聞重製及再分發權限。
- `app/api/global/route.ts` 在供應商設定完成後才回傳正式資料。

### 會員、後台與付款

1. 採用正式驗證服務，啟用 email 驗證、密碼重設與管理員 MFA。
2. 建立 role-based access control，管理員權限只由伺服器判斷。
3. 以 PostgreSQL 保存會員、方案、訂閱與 webhook 事件。
4. 串接金流沙盒，驗證簽章、重複 webhook、退款與取消訂閱。
5. 付款狀態只能由已驗證的伺服器端 webhook 更新，不能由前端自行宣告已付款。
6. 以最小權限建立管理員帳號；初始密碼由管理員透過安全邀請或重設流程設定，不要提交到 Git 或聊天訊息。

## 部署方向

1. 將專案放入你自己的 GitHub repository。
2. 在 Vercel 匯入 repository，使用 Next.js 預設建置設定。
3. 先部署預覽環境，確認 build、API 回應及手機版。
4. 建立託管 PostgreSQL；設定正式資料庫 migration 與備份。
5. 在部署平台設定伺服器環境變數，切勿將 secret 放入 `NEXT_PUBLIC_*`。
6. 接入經授權的行情供應商並完成測試。
7. 設定正式網域與 HTTPS，配置 sitemap、robots、canonical 與 Search Console。
8. 完成資安、資料授權、隱私權政策、服務條款及付費測試後才正式開放。

## API 合約（起始版本）

- `GET /api/rankings`：法人排行。未設定資料來源時回傳 HTTP 503。
- `GET /api/stocks/{symbol}`：個股摘要。未設定資料來源時回傳 HTTP 503。
- `GET /api/stocks/{symbol}/candles`：K 線。未設定資料來源時回傳 HTTP 503。
- `GET /api/global`：全球行情與新聞。未設定資料來源時回傳 HTTP 503。

## 官方資料文件

- TWSE OpenAPI: https://openapi.twse.com.tw/
- TPEx OpenAPI: https://www.tpex.org.tw/openapi/

以上是可執行的起始專案，不是已部署的正式服務。
