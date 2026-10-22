# 免費會員登入部署指南（Google + Apple）

此專案使用 NextAuth v4，會員以 Google 或 Apple ID 登入即可查看每日 08:30 台股盤前分析。未登入者會被 `/api/market/morning-brief` 的伺服器端權限檢查擋下（HTTP 401）。

## Vercel Environment Variables
在 Vercel > Project > Settings > Environment Variables 設定以下值（至少 Production）：

- `NEXTAUTH_URL=https://ai-stock-lobster.vercel.app`
- `NEXTAUTH_SECRET`：安全隨機字串，建議 `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID`：Google OAuth Web client ID
- `GOOGLE_CLIENT_SECRET`：Google OAuth Web client secret
- `APPLE_CLIENT_ID`：Apple Services ID（例如 `com.example.web`，不是 iOS Bundle ID）
- `APPLE_CLIENT_SECRET`：以 Apple Developer Team ID、Sign in with Apple Key ID 和 .p8 私鑰簽發的 ES256 client-secret JWT；一般有效期不得超過六個月，須定期更新
- `CRON_SECRET`：Vercel Cron 的 Bearer token；若要讓 08:30 排程可在未登入時呼叫受保護的 API，必須設定

不必在尚未啟用 Apple 時先設 Apple 變數；只設定 Google 變數即可先測 Google。

## Google Cloud
1. Google Auth Platform > Branding / Audience 完成同意畫面，External 正式發布前留意測試用戶限制。
2. Clients > Create client > Web application。
3. Authorized JavaScript origins: `https://ai-stock-lobster.vercel.app`
4. Authorized redirect URIs: `https://ai-stock-lobster.vercel.app/api/auth/callback/google`
5. 複製 Client ID / Secret 至 Vercel，Redeploy。

## Apple Developer
1. 必須有可用的 Apple Developer Program 帳號與 Team。
2. Certificates, Identifiers & Profiles > Identifiers 建立/設定支援 Sign in with Apple 的 App ID（Primary App ID）。
3. 建立 Services ID，啟用 Sign in with Apple，設定網域 `ai-stock-lobster.vercel.app`，Return URL `https://ai-stock-lobster.vercel.app/api/auth/callback/apple`。
4. Keys > 建立 Sign in with Apple Key，關聯 Primary App ID，下載一次性的 `.p8` 私鑰並妥善保存。
5. 使用 Team ID、Key ID、Services ID 和 .p8 產生 ES256 Apple client-secret JWT，audience=`https://appleid.apple.com`，issuer=Team ID，subject=Services ID；設定 `APPLE_CLIENT_ID` 與 `APPLE_CLIENT_SECRET`。
6. Redeploy 後在 Safari 測試 Apple 登入，特別確認第一次登入時的使用者資料與私密轉寄 Email。

## 驗收
- 未登入：`/api/market/morning-brief` 回 401，首頁顯示鎖定內容。
- Google 登入：成功回到首頁並顯示盤前分析。
- Apple 登入：成功回到首頁並顯示盤前分析。
- 登出：重新鎖定；確認瀏覽器 Network 無法在登出後讀取受保護 API。
- `/api/auth/providers` 應列出已設定的 OAuth providers。
- 不要公開 OAuth secret、Apple .p8、NEXTAUTH_SECRET、CRON_SECRET。

## 限制
- 現階段是免費登入會員，不是付費訂閱。
- Apple client secret JWT 需定期更新。
- Vercel Cron 的排程與觸發時間取決於方案；此 API 的 Cron 授權不代表已實作盤前報告持久化快取。
