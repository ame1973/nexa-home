# 保留的上游授權來源

[English](readme.md) | **繁體中文**

Nexa Home 自身的授權位於根目錄 [LICENSE](../LICENSE)。[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 保留重新散布所需的第三方版權聲明與授權文字。`npm run notices -- --check` 會驗證清單是否仍符合已安裝的鎖定依賴與已匯入的 Go 模組。

本文件提供繁體中文閱讀說明，不取代或變更授權條款。MIT 與第三方授權的原始文字維持原文，重新散布時仍須完整保留。

另行保留四份上游聲明與授權文字：

- `shadcn-ui.txt`：複製的 shadcn/ui 元件所採用的 MIT 授權，來源為 [shadcn-ui/ui 的 8a3536678a528cc012b9e62484290e79d0be410f](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/LICENSE.md)。
- `react-remove-scroll-bar-2.3.8.txt`：此 npm 發行版本宣告 MIT，但發布套件中未包含授權檔。因此保留上游專案的 MIT 原文與署名，來源為 [theKashey/react-remove-scroll-bar 的 8ca9ba5ea52de03308fe8ced94f7b159a44d28ff](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE)，授權 blob 為 `7c08c3990396ecefd90f99ff5d9a34f26f5b5616`。此替代來源只適用於該版本，相依套件變更時必須重新審查。
- `mozilla-ca-certificates.txt`：固定建置器所用 Alpine CA bundle 的來源、原始碼與套件雜湊，以及原始碼中憑證工具的原始聲明與授權。Alpine 套件配方與建置器 SBOM 的授權表達式不同；聲明保留兩者，不推測何者正確。
- `MPL-2.0.txt`：Mozilla 憑證原始資料所採用的 Mozilla Public License 2.0 原文。

產生器會直接讀取已安裝 npm 套件、匯入的 Go 模組目錄及 Go 工具鏈中的一般授權／聲明檔案，不會透過網路擷取授權，也不會推測版權持有人。固定建置器變更時必須重新審查 CA 聲明；容器驗收測試亦會檢查隨附 bundle 的記錄雜湊。測試、掃描、建置容器與可選模擬工具不會隨執行期映像重新散布。
