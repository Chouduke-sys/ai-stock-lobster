# AI 股市龍蝦：管理者與付費會員架構
## 現階段
- Admin: Google OAuth 登入後，後端以 ADMIN_EMAILS 白名單及 OAuth provider 雙重驗證；/admin 與 /api/admin/dashboard。
- Free: 現有會員功能維持不變。
- Pro: 目前只是規劃，尚未啟用付費或訂閱，不能當作付費授權系統。
- 匿名事件：page_view；會員閱讀九大板塊：morning_brief_view。兩者分開計算。
## 上線前必備
1. 設定 Vercel production 環境變數 ADMIN_EMAILS（管理者 Google 帳號 Email，可逗號分隔）。
2. 建立 Supabase 專案，在 SQL editor 執行 docs/admin-analytics-setup.sql。
3. Vercel production 設定 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（加密，絕對不可使用 NEXT_PUBLIC_ 前綴）。
4. 重新部署；以管理者 Google 登入後進入 /admin 驗證。以一般會員帳號訪問應回傳 403。
5. 網站隱私權聲明揭露匿名分析及登入事件用途，訂定保留期限。
## 後續付費系統（尚未實作）
- 建立 user_entitlements、subscriptions、payments、audit_logs；權限由伺服器檢查，不依賴前端隱藏按鈕。
- 使用台灣金流服務商串接託管結帳、Webhook 簽章驗證、事件冪等、付款失敗與退款處理。
- 後台管理價格方案、會員權限及訂閱生命週期；變更需留存稽核紀錄。
- 目前儀表板統計查詢最多 10,000 筆事件，流量增大後應改成資料庫聚合或每日摘要。
