# Brain Block / 脳ブロック

一鍵上傳到 GitHub Pages 的靜態版本。

## 使用方式
1. 將整個資料夾上傳到你的 GitHub Repo（例如 `brain-block`）。
2. 在 GitHub -> Settings -> Pages -> Source 選擇 `Deploy from a branch`，分支 `main`，資料夾 `/ (root)`。
3. 儲存後約數十秒，頁面會出現在 Pages URL。

## 本地開發
直接打開 `index.html` 也可運作（需連網以讀取排行榜 Web App）。

## 檔案結構
- `index.html`、`styles.css`、`main.js`
- `public/` 影像與圖示（已包含你提供的圖檔與我生成的 SVG）
- `data/levels.json`、`data/config.json`、`data/puzzles.json`（100 題）

## 排行榜 Web App
- URL 與 `sharedSecret` 已設定於 `data/config.json`
