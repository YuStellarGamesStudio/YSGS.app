# 專案資訊

- 網頁名稱：星語遊戲網
- 網域：ysgs.app
- 語系：網站原生支援英文、繁體中文、日文三語，以英文為主要（預設）語系；新增或修改內容與介面時，須同步提供三語版本。
- 語系切換：須在前端即時切換，不得重新整理頁面或整頁導覽，並同步更新 `<html lang>`。
- 介面文字集中於 `src/i18n.ts`，三語必須有相同鍵值（由 `Messages` 型別檢查）；遊戲資料來自 GameCatalog（預設 `https://data.ysgs.app/`，可用 `VITE_CATALOG_BASE_URL` 覆寫），屬外部輸入，須以 `textContent` 顯示且外部連結限 HTTPS。
- 風格：提供深色與淺色兩種風格，色彩一律使用 `src/style.css` 中各風格的 CSS 變數。

# Security Policy Maintenance

- Keep `SECURITY.md` in English.
- Review `SECURITY.md` when website features, dependencies, deployment settings, reporting channels, supported versions, or security practices change. Update affected sections and the last-updated date when the policy materially changes.
- Distinguish policy requirements from implemented controls and verified results. Never claim scans, tests, deployment protections, or reporting channels are active without evidence.
- Do not publish secrets, personal data, or undisclosed vulnerability details in the policy. Record only disclosure-safe remediation summaries and verification limitations.

# Website Development and Deployment

- Stack: Vite, native TypeScript, and npm. CI uses Node.js 24 from `.node-version`.
- Install dependencies with `npm ci`; use `npm run dev` for local development.
- Run `npm run check` for strict type checking, dependency auditing (high/critical threshold), and the production build. Use `npm run preview` to inspect the built website.
- Deploy only `dist`. The build copies the root `CNAME` and `.nojekyll` files into `dist`; keep the root files as the single source of truth.
- Pull requests to `main` run `.github/workflows/ci.yml`. Pushes to `main` run `.github/workflows/pages.yml`, which reuses CI and deploys its successful artifact.
- Before enabling deployment, select **GitHub Actions** under repository **Settings → Pages → Build and deployment → Source**, configure the custom domain as `ysgs.app`, and verify DNS and HTTPS. A copied `CNAME` alone does not configure the custom domain for an Actions deployment.
- The Vite default base path `/` targets the custom domain. If hosting under a repository subpath instead, update the build base path before deployment, along with the root-relative paths in `public/manifest.webmanifest`, `src/sw.js`, and `scripts/write-sw.mjs`.
- Keep deployment permissions isolated from build and pull-request jobs, and maintain reviewed commit pins for GitHub Actions.
