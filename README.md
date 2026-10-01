# 星語遊戲網

星語遊戲網是 YuStellarGamesStudio 的網站專案，使用 **Vite＋原生 TypeScript** 建置，並透過 **GitHub Actions** 執行持續整合與 GitHub Pages 部署。

- 預定網站網址：https://ysgs.app
- 原始碼倉庫：https://github.com/YuStellarGamesStudio/YSGS.app

本網站設計為原生支援**英文、繁體中文、日文**三語語系，以**英文為主要（預設）語系**；新增或修改網站內容時，應同步維護三種語言。切換語系須在前端即時完成，不得重新整理頁面或整頁導覽，並同步更新 `<html lang>`。

網站為單頁應用程式（hash 路由），所有頁面與語系、風格切換皆在前端完成，不會重新載入頁面：

| 路由 | 內容 |
| --- | --- |
| `#/` | 首頁：主視覺、統計數據與精選遊戲 |
| `#/games` | 遊戲庫：關鍵字搜尋（名稱、分類、標籤，跨三語）與分類篩選 |
| `#/games/<id>` | 遊戲詳細頁：封面、介紹、分類、標籤、可用啟動語言與資料紀錄連結 |
| `#/data` | 資料主控台：統計、分類分布圖、在地化矩陣、標籤雲、分類字典與實際請求的網路紀錄 |

- 語系：預設英文，可切換繁體中文、日文；選擇會存於 `localStorage`。「開始遊玩」優先使用遊戲資料的 `launchUrls[目前語系]`，沒有時使用 `url`。
- 風格：提供深色與淺色兩種風格；首次造訪依系統偏好，選擇會存於 `localStorage`。
- 3D 背景：以 [XYZ.js](https://github.com/YueyuHoshizora/XYZ.js) v1.7 渲染全畫面 3D 場景（星空、全像格線地板、星核與軌道環；每款遊戲一顆衛星，資料頁以分類數量生成 3D 柱狀天際線），鏡頭隨路由移動、隨滑鼠輕微視差，並跟著深色／淺色切換。引擎依 WebGPU→WebGL2 選擇後端，以獨立 chunk 延遲載入；兩者皆不可用時保留 CSS 背景。系統開啟「減少動態效果」時場景保持靜止。
- 遊戲資料於瀏覽器執行時讀取 [GameCatalog](https://github.com/YuStellarGamesStudio/GameCatalog) 的 `allgames.json`、`games/<id>.json` 與 `categories.json`，只顯示 `status` 為 `published` 的遊戲；外部連結與封面只接受 HTTPS 網址。

尚未加入帳號、後端 API 或資料儲存功能。部署流程已定義於倉庫；是否已上線，仍須以 GitHub Actions 執行結果與實際網站為準。

## 技術組成

| 項目 | 使用方式 |
| --- | --- |
| TypeScript | 網站程式碼，啟用嚴格型別檢查 |
| Vite | 本機開發、正式建置與產物預覽 |
| npm | 相依套件與 lockfile 管理 |
| GitHub Actions | 型別檢查、相依套件稽核、建置與部署 |
| XYZ.js 1.7.0 | 3D 背景渲染；未發佈於 npm，套件已解壓於 `vendor/xyz.js/`，以 `file:` 相依安裝 |
| GitHub Pages | 靜態網站發布目標 |

## 環境需求

- 建議使用 **Node.js 24**，與 CI 的版本一致；版本設定位於 [`.node-version`](.node-version)。
- 使用 npm 安裝相依套件；`package.json` 要求 Node.js 24 或以上。
- `.npmrc` 設定 `install-links=true`，讓 `vendor/xyz.js` 以複製方式安裝，不會連帶安裝該套件的開發相依套件。XYZ.js 的 `package.json` 宣告 Node.js 26 以上，但它只在瀏覽器執行，Node.js 24 安裝時只會出現 engine 警告。
- 使用 Git 取得專案。

本專案不需要後端服務或自訂部署憑證。不要將私密金鑰或 Token 放入前端程式碼、環境變數產物或靜態檔案；發布後的前端資源可被下載。

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
| `npm run build` | 建立正式產物，並複製 Pages 標記檔案 |
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
design/
  og-image.svg                 # 分享圖原始檔（修改後重新輸出成 public/og-image.png）
  favicon.svg                  # 網站圖示原始檔（修改後重新輸出成 public/favicon.ico）
public/
  favicon.ico                  # 16／32／48 px 網站圖示
  og-image.png                 # 1200×630 Open Graph 分享圖
  robots.txt                   # 允許所有爬蟲並指向 sitemap
  sitemap.xml                  # 只列首頁；hash 路由（#/…）無法個別收錄
scripts/
  copy-pages-files.mjs         # 將根目錄標記檔案複製到 dist
src/
  main.ts                     # 應用程式殼層、路由與各頁面
  i18n.ts                     # 英文、繁體中文、日文介面文字
  catalog.ts                  # GameCatalog 資料讀取與驗證
  style.css                   # 網站樣式（深色／淺色風格）
  stage.ts                    # XYZ.js 3D 背景場景
  vite-env.d.ts               # Vite 與環境變數型別宣告
index.html                    # 網頁入口
package.json                  # 相依套件與 npm 指令
vendor/xyz.js/                # XYZ.js v1.7 發佈包（Apache-2.0，來源 SHA-256 已比對 SHA256SUMS）
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

[Pages workflow](.github/workflows/pages.yml) 在推送至 `main` 或手動執行時觸發；工作僅允許在 `main` 上執行。

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
