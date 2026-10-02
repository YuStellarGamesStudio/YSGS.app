# 星語遊戲網

星語遊戲網是 YuStellarGamesStudio 的網站專案，使用 **Vite＋原生 TypeScript** 建置，並透過 **GitHub Actions** 執行持續整合與 GitHub Pages 部署。

- 預定網站網址：https://ysgs.app
- 原始碼倉庫：https://github.com/YuStellarGamesStudio/YSGS.app

本網站設計為原生支援**英文、繁體中文、日文**三語語系，以**英文為主要（預設）語系**；新增或修改網站內容時，應同步維護三種語言。切換語系須在前端即時完成，不得重新整理頁面或整頁導覽，並同步更新 `<html lang>`。

網站為單頁應用程式，路由放在查詢參數中，每個頁面都是可直接開啟、可分享的網址；站內連結以 History API 切換，所有頁面與語系、風格切換皆在前端完成，不會重新載入頁面：

| 路由 | 內容 |
| --- | --- |
| `/` | 首頁：主視覺、統計數據與精選遊戲 |
| `?view=games` | 遊戲庫：關鍵字搜尋（名稱、分類、標籤，跨三語）與分類篩選 |
| `?view=games&id=<id>` | 遊戲詳細頁：封面、介紹、分類、標籤、可用啟動語言與資料紀錄連結 |
| `?play=<id>` | 遊玩：以全畫面 iframe 在本站內開啟遊戲，左上角按鈕（或焦點不在遊戲內時按 Esc）會先跳出確認視窗，確認後才返回詳細頁；遊戲載入完成後 3D 背景完全停止渲染，離開後恢復 |
| `?view=data` | 資料主控台：統計、分類分布圖、在地化矩陣、標籤雲、分類字典與實際請求的網路紀錄 |
| 其他無效路由／不存在的遊戲 | 404 提示、返回首頁與遊戲庫入口，以及最多三款隨機遊戲推薦 |

- SEO：每個頁面會更新自己的 `<title>`、描述、canonical 與 Open Graph／Twitter 標籤；遊玩頁的 canonical 指向該遊戲的詳細頁，不存在的頁面或遊戲加上 `noindex`。
- 找不到頁面時沿用遊戲庫卡片，提供封面、在地化介紹、分類、詳細資料與遊玩入口。推薦從已發布遊戲中隨機抽取、不重複；不足三款時顯示全部可用遊戲，同一份已載入目錄在切換語系或風格時保留選擇。目錄載入失敗時保留導覽與重試入口。

- 語系：預設英文，可切換繁體中文、日文；選擇會存於 `localStorage`。「開始遊玩」優先使用遊戲資料的 `launchUrls[目前語系]`，沒有時使用 `url`。
- 風格：提供深色與淺色兩種風格；首次造訪依系統偏好，選擇會存於 `localStorage`。首頁採較緊湊的首屏，讓第一列遊戲封面提早露出；封面底部使用較淡的暗漸層，保留圖片細節。
- 3D 背景：以 [XYZ.js](https://github.com/YueyuHoshizora/XYZ.js) v1.11 渲染全畫面 3D 場景（星空、全像格線地板、行星系統；資料頁以分類數量生成 3D 柱狀天際線），鏡頭隨路由移動、隨滑鼠輕微視差，並跟著深色／淺色切換。地板格線依頁面淡出：會看到行星系統的頁面在系統前方就淡出，避免格線穿過軌道與行星；資料頁保留遠處地板承托柱狀圖。行星系統是一顆帶日冕的藍白恆星，每款遊戲對應一顆行星：行星表面為程式產生的貼圖（岩質、雲層、海洋、氣體巨行星與行星環），只受恆星點光源照明而有晝夜相位，軌道接近共面，角速度依克卜勒第三定律隨半徑遞減。科幻動態效果：HUD 目標鎖定框每 4.5 秒跳到另一顆行星（放大收合並閃爍鎖定）、恆星下方參考盤定期擴散聲納波紋、能量脈衝沿地板格線朝鏡頭掃過，以及偶爾劃過高空的流星；恆星另有一道橫向的鏡頭光芒。開啟「減少動態效果」時，只保留靜止在最內側行星的鎖定框與鏡頭光芒。引擎依 WebGPU→WebGL2 選擇後端，以獨立 chunk 延遲載入；兩者皆不可用時保留 CSS 背景。為控制 GPU 負載，場景以 1× 解析度、不開 MSAA（保留 FXAA）、最高 24 fps 渲染；系統開啟「減少動態效果」或視窗失去焦點時場景保持靜止，只在切換頁面、主題或視窗大小後重繪；分頁切到背景或視窗最小化時完全停止渲染，回到前景後繼續。
- 背景音樂：原創〈Stellar Drift／星際漂流／星の漂流〉以隨 XYZ.js 附帶的官方 OPM.js 1.1.0 合成；84 BPM、A 小調、16 小節（約 46 秒）循環，以暖低音、柔和 FM 雙音與稀疏鐘聲呼應星空、行星與全像格線。預設音量 **5%**，頁首提供播放／暫停與音量滑桿，偏好存於 `localStorage`。受瀏覽器自動播放限制，首次點擊或按鍵後才啟動；切換一般頁面、語系或主題不會重播，進入遊戲、隱藏分頁或暫存頁面時暫停，返回後續播。音訊獨立於 3D 渲染，只使用一個 AudioContext／AudioWorklet；需要 HTTPS 或 localhost，失敗時可手動重試，不影響網站操作。
- 樂曲檔案：[`public/music/stellar-drift.json`](public/music/stellar-drift.json) 獨立保存三語曲名、`bpm`、`durationBeats` 與 `tracks`。每個 track 包含官方 OPM `voice`（四個 FM operators／ADSR）及明確的 `notes: [{ note, beat, length }]`；`note` 是 MIDI 音高，`beat` 與 `length` 都以拍為單位。修改編曲只需編輯 JSON；所有音符須在循環長度內，編曲含 release 尾音同時最多八音，避免 OPM 搶音。
- 遊戲資料於瀏覽器執行時讀取 [GameCatalog](https://github.com/YuStellarGamesStudio/GameCatalog) 的 `allgames.json`、`games/<id>.json` 與 `categories.json`，只顯示 `status` 為 `published` 的遊戲；外部連結與封面只接受 HTTPS 網址。
- PWA：提供 `manifest.webmanifest` 與圖示，可安裝成獨立視窗的 App。Service worker 只在正式產物註冊，預先快取網站殼層（HTML、JS、CSS、圖示）；頁面導覽走網路優先，離線時回傳快取的殼層；GameCatalog 的 JSON 走網路優先並保留最後一份成功回應，離線時仍能瀏覽遊戲庫與資料頁。遊戲本體與外部封面不在快取範圍，離線時無法遊玩。新版部署後，新的 worker 會在所有分頁關閉後才接手。

尚未加入帳號、後端 API 或資料儲存功能。部署流程已定義於倉庫；是否已上線，仍須以 GitHub Actions 執行結果與實際網站為準。

## 技術組成

| 項目 | 使用方式 |
| --- | --- |
| TypeScript | 網站程式碼，啟用嚴格型別檢查 |
| Vite | 本機開發、正式建置與產物預覽 |
| npm | 相依套件與 lockfile 管理 |
| GitHub Actions | 型別檢查、相依套件稽核、建置與部署 |
| XYZ.js 1.11.0 | 3D 背景渲染；未發佈於 npm，套件已解壓於 `vendor/xyz.js/`，以 `file:` 相依安裝 |
| OPM.js 1.1.0 | 自託管 FM 背景音樂合成；使用 XYZ.js 內附的官方原始發佈檔，不新增 npm 相依套件 |
| GitHub Pages | 靜態網站發布目標 |

## 環境需求

- 建議使用 **Node.js 24**，與 CI 的版本一致；版本設定位於 [`.node-version`](.node-version)。
- 使用 npm 安裝相依套件；`package.json` 要求 Node.js 24 或以上。
- `.npmrc` 設定 `install-links=true`，讓 `vendor/xyz.js` 以複製方式安裝，不會連帶安裝該套件的開發相依套件。XYZ.js 的 `package.json` 宣告 Node.js 22 以上，完全相容於本專案的 Node.js 24。
- 使用 Git 取得專案。

本專案不需要後端服務或自訂部署憑證。不要將私密金鑰或 Token 放入前端程式碼、環境變數產物或靜態檔案；發布後的前端資源可被下載。

`npm run dev` 與 `npm run build` 會先由 `scripts/copy-opm.mjs` 將 `vendor/xyz.js/dist/vendor/opm/` 原樣複製到自動產生、已忽略的 `public/opm/`。不要直接修改該目錄；保留官方 ESM、chunks、AudioWorklet 與 LICENSE 的相對位置。正式建置會把 OPM 與樂曲 JSON 一起複製到 `dist`，並納入 service worker 殼層快取，無需外部音樂服務。

## 本機開發

```sh
git clone https://github.com/YuStellarGamesStudio/YSGS.app.git
cd YSGS.app
npm ci
npm run dev
```

開啟終端機顯示的本機網址。Vite 預設使用 `http://localhost:5173`；若連接埠已被占用，請以實際輸出為準。

遊戲資料來源預設為 `https://data.ysgs.app/`。若要使用本機的 GameCatalog 資料，可設定 `VITE_CATALOG_BASE_URL`（結尾須有 `/`），並以允許跨來源請求（`Access-Control-Allow-Origin`）的靜態伺服器提供資料：

```sh
VITE_CATALOG_BASE_URL=http://127.0.0.1:8787/ npm run dev
```

此值會在建置時寫入前端程式碼，只能放公開網址，不可放任何憑證。

一般安裝請使用 `npm ci`，依照 `package-lock.json` 安裝鎖定版本。新增或更新相依套件時，應一併檢視並提交 `package.json` 與 `package-lock.json`。

## 檢查與建置

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動本機開發伺服器 |
| `npm run typecheck` | 執行 TypeScript 型別檢查，不輸出 JavaScript |
| `npm audit --audit-level=high` | 稽核相依套件；高風險或嚴重弱點會讓指令失敗 |
| `npm run build` | 建立正式產物，複製 Pages 標記檔案，產生 sitemap 與 service worker |
| `npm run preview` | 在本機預覽既有的正式產物 |
| `npm run check` | 依序執行型別檢查、相依套件稽核及正式建置 |

提交變更前，建議執行與 CI 相同的檢查：

```sh
npm ci
npm run check
npm run preview
```

`npm run preview` 不會先執行建置，必須已有 `dist` 產物；它是本機預覽工具，不是正式環境伺服器。

相依套件稽核包含開發相依套件，需要連線至 npm registry 的稽核服務。高風險、嚴重弱點或稽核服務失敗會阻擋後續建置；較低等級的警告仍需評估。稽核通過不代表網站沒有弱點，目前也沒有另外定義自動化應用程式測試套件。

## 專案結構

```text
.github/workflows/
  ci.yml                       # PR 檢查與可重用 CI
  pages.yml                    # main 的 GitHub Pages 部署
  scheduled-deploy.yml         # 每 5 分鐘以 github-actions[bot] 派送 Pages 部署
design/
  og-image.svg                 # 分享圖原始檔（修改後重新輸出成 public/og-image.png）
  favicon.svg                  # 網站圖示原始檔（修改後重新輸出成 public/favicon.ico）
public/
  favicon.ico                  # 16／32／48 px 網站圖示
  icon.svg                     # App 圖示原始檔，也直接作為 SVG 圖示（修改後重新輸出下列 PNG）
  icon-192.png、icon-512.png   # PWA 圖示
  icon-maskable-512.png        # Android 可裁切圖示（圖形縮在安全區內）
  apple-touch-icon.png         # 180 px iOS 主畫面圖示
  manifest.webmanifest         # PWA 名稱、顏色、圖示與捷徑
  og-image.png                 # 1200×630 Open Graph 分享圖
  robots.txt                   # 允許所有爬蟲並指向 sitemap
  music/stellar-drift.json     # 原創 OPM 三軌循環樂曲（音色、音符與拍數）
scripts/
  copy-pages-files.mjs         # 將根目錄標記檔案複製到 dist
  copy-opm.mjs                # 從官方 vendor 複製 OPM 到自動產生的 public/opm
  write-sitemap.mjs            # 建置時讀取 GameCatalog，產生 dist/sitemap.xml（首頁、遊戲庫、資料主控台與每款已發布遊戲的詳細頁；讀不到目錄時只列固定頁面）
  write-sw.mjs                 # 以 src/sw.js 為範本，寫入殼層檔案清單與內容雜湊，產生 dist/sw.js
src/
  main.ts                     # 應用程式殼層、路由與各頁面
  i18n.ts                     # 英文、繁體中文、日文介面文字
  catalog.ts                  # GameCatalog 資料讀取與驗證
  style.css                   # 網站樣式（深色／淺色風格）
  stage.ts                    # XYZ.js 3D 背景場景
  music.ts                    # 獨立 OPM 音訊生命週期、音量與循環排程
  stage-textures.ts           # 行星、恆星、日冕、行星環與 HUD 鎖定框的程式產生貼圖
  sw.js                       # Service worker 範本（不經 Vite 打包，由 write-sw.mjs 輸出）
  vite-env.d.ts               # Vite 與環境變數型別宣告
index.html                    # 網頁入口
package.json                  # 相依套件與 npm 指令
vendor/xyz.js/                # XYZ.js v1.11 發佈包（Apache-2.0，來源 SHA-256 已比對 SHA256SUMS）
.npmrc                        # npm 設定（install-links）
package-lock.json             # 鎖定相依套件版本
tsconfig.json                 # TypeScript 設定
.node-version                 # CI 使用的 Node.js 版本
CNAME                         # 自訂網域記錄：ysgs.app
.nojekyll                     # 空的 Pages 標記檔案
AGENTS.md                     # 專案資訊與持續維護規則
CLAUDE.md                     # 引用 AGENTS.md 的安全工作指引
SECURITY.md                   # 英文安全政策
LICENSE                       # 授權條款
```

`node_modules/` 與 `dist/` 是本機安裝或建置產物，已由 `.gitignore` 排除，不應提交。

## CI／CD 流程

### 持續整合

[CI workflow](.github/workflows/ci.yml) 會在以下情況執行：

- Pull Request 的目標分支為 `main`。
- 在 GitHub Actions 手動執行。
- 被 Pages workflow 作為可重用工作流程呼叫。

流程使用 Node.js 24，執行 `npm ci` 與 `npm run check`。只有 Pages 流程呼叫並要求上傳時，才會將成功建置的 `dist` 打包為 Pages artifact。

### GitHub Pages 部署

[Pages workflow](.github/workflows/pages.yml) 在推送至 `main` 或手動執行時觸發；工作僅允許在 `main` 上執行。為了讓 sitemap 追上 GameCatalog 的更新，[Scheduled Pages deploy](.github/workflows/scheduled-deploy.yml) 每 5 分鐘（cron `*/5 * * * *`）以 `GITHUB_TOKEN` 派送 Pages workflow，因此部署執行者顯示為 `github-actions[bot]`。GitHub 可能延遲或略過排程執行，且排程只會在預設分支上運作。

```text
推送 main／手動執行 main
        ↓
呼叫 CI：安裝 → 型別檢查 → 相依套件稽核 → 建置
        ↓ 成功後
上傳 dist artifact
        ↓
部署至 GitHub Pages
```

部署使用 CI 已檢查過的產物，不另外重建。檢查失敗時，部署工作不會執行。

安全與發布設定包括：

- 建置工作只有 `contents: read`，checkout 不保留 Git 憑證。
- 僅部署工作取得 `pages: write` 與 `id-token: write`。
- GitHub Actions 固定使用 commit SHA，而不是可變動的版本標籤。
- 部署使用 `github-pages` environment，Pages 流程不會主動取消正在執行的同組工作。
- Pull Request 不會部署網站，也不使用 `pull_request_target`。

## 啟用 GitHub Pages 與自訂網域

倉庫管理者需要完成以下設定；新增 workflow 或 `CNAME` 並不會自動完成這些操作：

1. 開啟倉庫的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 將 **Custom domain** 設為 `ysgs.app`，依照 GitHub 指引設定並驗證 DNS。
4. 確認憑證與 HTTPS 可用，並在可用時啟用 **Enforce HTTPS**。
5. 檢視 `github-pages` environment 的部署限制，建議只允許 `main` 部署；視需要設定分支保護與必要 CI 檢查。
6. 推送至 `main`，或在 Actions 頁面手動執行 **GitHub Pages**，確認各工作成功與發布結果。

根目錄的 `CNAME` 和 `.nojekyll` 是唯一來源，建置時會複製到 `dist`。不要直接編輯 `dist` 中的副本。

目前使用 Vite 預設的 `/` 資源基底路徑，適合 `https://ysgs.app/` 這類根網域部署。若改成 GitHub 的 `/YSGS.app/` 專案子路徑，必須先調整 Vite 的 `base` 設定並重新建置，避免 JavaScript 和 CSS 載入失敗。

### 遊戲隔離與防嵌入 headers

遊戲 iframe 的 sandbox 僅允許 `allow-scripts allow-same-origin allow-pointer-lock`：保留遊戲執行、原來源儲存與滑鼠鎖定，不開放頂層導覽、彈窗、表單提交或下載。同來源遊戲不授予 `allow-same-origin`，避免 scripts 移除自身 sandbox；需要儲存功能的遊戲應部署於獨立來源。Fullscreen、autoplay 等仍由 iframe 的 Permissions Policy 控制，不需要額外 sandbox token。

GitHub Pages 不支援由此倉庫設定自訂 HTTP response headers；`_headers` 或 HTML meta 無法實作 `frame-ancestors`。在代理 `ysgs.app` 的 Cloudflare zone 建立 **Response Header Transform Rule**：

- 條件：`http.host eq "ysgs.app"`（不要套用到遊戲來源或其他子網域）。
- **Set static** `Content-Security-Policy` 為 `frame-ancestors 'none';`。
- **Set static** `X-Frame-Options` 為 `DENY`。
- 若已有 CSP，保留原有 directives 並合併 `frame-ancestors 'none'`，不要覆蓋其他保護。確認後續規則不會移除這兩個 headers。

這些規則禁止其他網站嵌入本站，不影響本站嵌入外部遊戲。需要 Cloudflare 管理權限才能啟用，修改倉庫不代表已部署。啟用後以 `curl -sS -D - -o /dev/null https://ysgs.app/` 確認 headers，並在不同來源的頁面測試嵌入被瀏覽器拒絕。

官方文件：[Cloudflare Response Header Transform Rules](https://developers.cloudflare.com/rules/transform/response-header-modification/)。

官方文件：

- [設定 GitHub Pages 發布來源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [使用 GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [管理 GitHub Pages 自訂網域](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 安全政策與維護

請閱讀 [SECURITY.md](SECURITY.md)，了解弱點回報、掃描授權、風險分級、修補驗證與事件處理規則。

- 不要在公開 Issue、Pull Request 或提交訊息中揭露尚未公開的可利用弱點、有效憑證或個人資料。
- 優先依安全政策尋找私密回報管道；GitHub 私密弱點回報是否已啟用，仍須確認。
- 安全檢查預設限於本機程式碼與測試環境。對公開網站或第三方服務進行主動掃描前，必須取得明確授權。
- 功能、相依套件、部署或安全回報方式改變時，同步檢視本文件與 `SECURITY.md`，讓文件與實際實作保持一致。

## 授權

倉庫包含 **GNU Affero General Public License 第 3 版（AGPLv3）**。完整條款請參閱 [LICENSE](LICENSE)。
