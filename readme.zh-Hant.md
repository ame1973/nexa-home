# Nexa Home

[English](readme.md) | **繁體中文**

為日常使用的服務打造的自架啟動器。Nexa Home 結合簡潔的 Future Glass 介面、單一 Go 程序、本機 SQLite 資料庫與本機儲存的圖示。

- 單一管理員、受保護的首次設定，以及公開或私人首頁。
- 服務、我的最愛、分類、標籤、鍵盤排序與桌面拖放排序。
- 完全在瀏覽器內搜尋；伺服器不會探測服務網址。
- 深色、淺色與系統佈景主題；可選擇玻璃效果；十二種介面語言，包含繁體／簡體中文與阿拉伯文 RTL。
- 內建 Lucide 圖示，以及經驗證的 PNG、WebP 或無主動內容的 SVG 上傳。快取的網站圖示透過檔案上傳，不會從遠端擷取。
- 可攜式 JSON 匯出，以及經驗證、明確確認後才執行的取代式還原。

除了必填的主要網址，也可儲存 LAN 與 WAN 連結。啟動器只會開啟主要網址；不包含自動網路切換、健康輪詢、PWA／離線模式、多使用者或 NAS／Docker 控制功能。

## Docker 部署

從可信任的原始碼工作目錄，將 `deploy/.env.example` 複製為已被 Git 忽略的 `deploy/.env`，並設定精確的公開 Origin。進行隔離的回送位址測試時，使用 `NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080`，並明確設定 `NEXA_ALLOW_HTTP_COOKIE=true`。遠端存取則應設定可信任的 HTTPS 反向代理，並將此旗標維持為 `false`。

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env for your own HTTPS domain or the isolated HTTP values above.
docker compose --env-file deploy/.env -f deploy/compose.yaml up --detach --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T nexa-home /nexa-home healthcheck
```

預設只綁定 **127.0.0.1:8080**，而非所有 NAS 網路介面。具名資料卷會持久保存 `/data`；一般升級時應維持相同的專案名稱。映像以 UID／GID `10001:10001` 執行，採用唯讀根檔案系統、移除 capabilities、啟用 no-new-privileges，且不含 shell 或 Node。Node／Go 只存在於建置階段。Linux amd64 與 arm64 共用同一份 Dockerfile，建置器版本與映像摘要均已固定。

在本機執行 `docker compose --env-file deploy/.env -f deploy/compose.yaml logs nexa-home` 讀取一次性權杖，再於已設定的 Origin 開啟 `/setup`。**請勿公開啟動日誌或權杖。** 遠端瀏覽器無法連到 NAS 的回送位址；使用其他裝置前，請先設定代理，或明確設定隔離 LAN 的綁定位址。

- [部署、HTTPS 代理、儲存與疑難排解](docs/zh-Hant/deployment.md)
- [備份、升級、版本回復與憑證遺失復原](docs/zh-Hant/backup-and-recovery.md)
- [安全邊界與經審查的相依套件政策](SECURITY.zh-Hant.md)
- [自動版本、release notes 與 GHCR 發布](docs/zh-Hant/releases.md)
- [更新紀錄](CHANGELOG.zh-Hant.md)與 [1.0.0 版本說明](docs/zh-Hant/release-notes-1.0.0.md)

這些本機建置說明不代表已發布登錄檔映像，或已執行託管 CI。原始映像掃描仍保留未使用的 OpenPGP 模組公告。經審查的例外僅限特定路徑與版本，於 2027-02-01 到期，且只有在沒有直接或轉移執行期相依套件使用 OpenPGP 時才有效；詳見安全說明。其他發現仍會使檢查失敗。

## 從原始碼建置

在 Linux 上使用 Node.js 24 系列的 24.14.1 或更新版本、npm，以及 `go.mod` 宣告的 Go 工具鏈（Go 1.27.3）建置。Node 只用於建置與測試；產出的執行檔內嵌前端，執行時不需要 Node。

```sh
npm ci --ignore-scripts
npm run build
./bin/nexa-home version
```

`npm run build:web` 會將編譯後的前端寫入 `internal/web/dist/`。執行會編譯主程式或內嵌網頁套件的 Go 命令前，必須先完成此前端建置。請勿手動修改產生的套件檔。瀏覽器套件使用 `/static/`；`/assets/{id}` 保留給受保護的圖示 API。

`npm run build` 依序使用明確的 `NEXA_BUILD_VERSION`、checkout 的確切版本 tag，或一致的開發套件基準。發行 CI 只同步暫存 checkout 的版本，不提交版本變更；詳見[自動版本規則](docs/zh-Hant/releases.md#版本檔案與原始碼建置)。

完成前端建置後，可交叉編譯 Linux arm64 執行檔：

```sh
VERSION=$(node scripts/release.mjs version) &&
  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath \
    -ldflags "-X main.version=$VERSION" \
    -o bin/nexa-home-linux-arm64 ./cmd/nexa-home
```

## 在本機執行

以下為隔離的回送位址安裝方式：

```sh
NEXA_LISTEN=127.0.0.1:8080 \
NEXA_DATA_DIR="$PWD/data" \
NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080 \
NEXA_ALLOW_HTTP_COOKIE=true \
./bin/nexa-home
```

開啟 `http://127.0.0.1:8080/setup`。啟動日誌包含有效期為 30 分鐘的一次性設定權杖。將它貼入遮蔽顯示的設定欄位，選擇使用者名稱，並建立 12–128 個字元的專用密碼。設定流程不會建立預設帳戶或密碼。初始化後即可登入管理服務。

**HTTP 工作階段 Cookie 僅是隔離可信任 LAN 或回送測試的明確例外。請勿將此設定暴露至網際網路。** 遠端存取應在反向代理使用 HTTPS，設定精確的公開 Origin，並維持 `NEXA_ALLOW_HTTP_COOKIE=false`。Nexa Home 本身在代理後方以 HTTP 接聽。

設定權杖只會輸出至本機啟動日誌，即使日誌層級設為 `error` 亦然。請將啟動日誌視為敏感資料。任何 HTTP 端點都不會回傳此權杖。重新啟動尚未初始化的執行個體會產生新權杖；已初始化的執行個體不會產生設定權杖。

以 SIGTERM 或 Ctrl+C 停止程序。程式會先完成進行中的 HTTP 工作、關閉待處理的匯入與儲存資源，再釋放資料目錄的獨占權。

## 設定

| 變數                       | 預設值         | 說明                                                                         |
| -------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `NEXA_LISTEN`              | `0.0.0.0:8080` | HTTP 接聽位址，必須包含 1 至 65535 的連接埠                                  |
| `NEXA_DATA_DIR`            | `/data`        | 私有、持久性本機儲存空間的絕對路徑                                           |
| `NEXA_PUBLIC_ORIGIN`       | 未設定         | 精確的瀏覽器 Origin，例如 `https://home.example.com`；設定可信任代理時為必填 |
| `NEXA_TRUSTED_PROXY_CIDRS` | 空白           | 以逗號分隔的代理端網段；僅信任實際的反向代理                                 |
| `NEXA_ALLOW_HTTP_COOKIE`   | `false`        | 僅供明確隔離的 HTTP 使用情境允許非安全 Cookie                                |
| `NEXA_LOG_LEVEL`           | `info`         | `debug`、`info`、`warn` 或 `error`                                           |
| `TZ`                       | 主機設定       | 不影響日誌時間戳記；日誌一律使用 UTC                                         |

公開 Origin 不可包含應用程式路徑或查詢字串。代理部署必須將應用程式發布在 Origin 根路徑。轉送的主機／通訊協定標頭不會改變應用程式信任的 Origin。只有經設定的可信任代理鏈尾段，才可提供轉送的用戶端 IP；信任所有位址的設定會被拒絕。程式不提供寬鬆的 CORS 設定。

## 資料擁有權

執行程序的使用者必須擁有資料目錄。請採用私有權限：目錄為 `0700`，資料庫與鎖定檔為 `0600`。既有路徑若允許群組／其他使用者存取、資料路徑是符號連結，或鎖定檔具有多重硬連結，程式會拒絕使用，而不是默默變更權限。

目錄包含：

- `nexa.db`，以及使用期間的 SQLite WAL／共用記憶體檔案。
- `assets/`，儲存經驗證、以內容定址的圖示檔案。
- `.nexa.lock`，用於獨占程序擁有權的鎖定檔。

同一資料目錄只允許一個應用程式或離線維護命令擁有。請勿刪除鎖定檔來繞過擁有權錯誤；程序離開時會自動釋放鎖定。請使用本機檔案系統，不要使用即時同步的 SQLite 檔案，或多寫入者共用的 NAS 掛載。

變更服務分類時會保留服務，並更新來源與目的兩個完整排序範圍，包括隱藏服務。刪除分類會保留其服務並移至「未分類」；因此，個別設為可見的服務可能變為公開。仍被參照的圖示不可刪除。

## 使用啟動器

1. 開啟「管理」（Manage），以名稱及主要 HTTP(S) 網址新增服務。
2. 選擇內建圖示或上傳本機圖示。點陣圖尺寸不得超過 512 × 512，每次上傳最多 1 MiB。
3. 可選擇分類、設定最多 20 個標籤、加入我的最愛，或隱藏服務／分類。
4. 在首頁搜尋名稱、描述、分類或標籤。`/` 與 Ctrl/Cmd+K 可聚焦搜尋欄；Escape 可清除搜尋。
5. 在管理介面中，選擇手動排序，並清除文字／標籤／可見性篩選後即可重新排序。明確的上移／下移控制支援鍵盤與行動裝置；編輯服務時，也可將它移至尚無服務的分類。

公開模式只會顯示可見分類中的可見服務，以及這些服務實際需要的分類／標籤。私人模式會在回傳服務資料或私人圖示前要求登入。變更密碼會撤銷所有工作階段，包括目前的工作階段。設定採用修訂版本檢查；衝突的草稿會保留，直到明確重新載入。

## 介面語言

使用頁首的地球圖示即可立即切換。每個選項都以該語言的自稱顯示：

| 語言 | Locale |
| ---- | ------ |
| 繁體中文 | `zh-Hant` |
| 简体中文 | `zh-Hans` |
| English | `en` |
| 日本語 | `ja` |
| 한국어 | `ko` |
| Español | `es` |
| Français | `fr` |
| Deutsch | `de` |
| Português (Brasil) | `pt-BR` |
| Русский | `ru` |
| العربية | `ar` |
| हिन्दी | `hi` |

已保存的瀏覽器偏好優先。否則，會依瀏覽器的語言順序選取第一個支援的語系；都不相符時使用繁體中文。明確指定的中文字形優先於地區：`zh-Hant` 維持繁體，`zh-Hans` 維持簡體。臺灣、香港與澳門預設使用繁體；一般中文、中國大陸、新加坡與馬來西亞預設使用簡體。葡萄牙文偏好使用巴西葡萄牙文翻譯。

阿拉伯文會將排版及鍵盤方向切換為由右至左，涵蓋導覽、對話框、選單與控制項。網址及十六進位色碼維持由左至右；使用者輸入的名稱和描述不會被翻譯。切換回其他語言會恢復由左至右。語言與佈景主題偏好僅保存於目前瀏覽器，不是共用網站設定，也不會進入可攜式備份。產品操作文件維持提供英文與繁體中文版。

介面使用**瀏覽器所在裝置**的系統字型，不會下載網頁字型。精簡 Linux 用戶端必須具有所顯示文字的字型，包含中日韓、阿拉伯文及天城文。若文字缺字或顯示方框，應在用戶端提供合適的系統字型，不是變更伺服器或 scratch 容器。

## 備份與還原

使用「管理 → 備份 → 匯出備份」（Manage → Backup → Export backup）。維持啟用「包含圖示檔案」（Include icon files），才能取得完整可還原的副本。備份包含私人名稱與網址，請妥善保護，並在應用程式資料目錄之外另存副本。管理員憑證、工作階段、速率限制狀態與稽核歷程不會匯出。

還原步驟：

1. 選擇 UTF-8 編碼的 Nexa Home JSON 備份，最多 16 MiB。
2. 驗證備份，檢查實體數量與設定變更警告。
3. 明確確認取代，再選擇「取代設定」（Replace configuration）。

還原會取代服務、分類、標籤、外觀與圖示，但保留目前的管理員、工作階段與稽核歷程。預覽綁定目前工作階段，五分鐘後到期，而且即使提交失敗也只能使用一次。重試前請重新驗證。驗證會在取代前拒絕未知／重複 JSON 欄位、無效參照或 ID、不安全內容、不支援的版本，以及過大的資料關聯。

所有接受的組態必須符合 **16 MiB 完整匯出上限，包含圖示 base64 的精確展開大小**。超過可攜式大小預算的寫入會以 `409 LIMIT_EXCEEDED` 原子性失敗，不會部分寫入。其他上限為服務、分類、標籤各 5000 筆；圖示 1024 個；排序位置必須為非負的 32 位元有號整數。若不含圖示的匯出仍參照缺失圖示，便無法還原。

請勿複製執行中的 SQLite／WAL 資料庫作為備份。優先使用可攜式匯出，或先停止程序，再進行保留完整資料目錄的基礎設施層級複製。

## 健康檢查與維護

```sh
NEXA_LISTEN=127.0.0.1:8080 ./bin/nexa-home healthcheck
```

`/healthz` 回報程序是否存活；`/readyz` 檢查資料庫是否就緒。兩者都不會回傳設定權杖或組態資料。`healthcheck` 命令使用已設定的接聽位址，不跟隨重新導向或環境代理；尚未就緒時會以非零狀態結束。

檢查資料目錄前，請先停止伺服器：

```sh
NEXA_DATA_DIR="$PWD/data" ./bin/nexa-home doctor
```

`doctor` 會檢查已知結構版本、SQLite 完整性、外鍵、儲存圖示的雜湊／中繼資料及影像有效性。它不會建立管理員、初始化不存在的資料庫，或清理孤立檔案。

## 開發與驗證

```sh
npm run check:generated
npm run lint:api
npm run test:contract
npm run typecheck
npm run lint:web
npm run test:build
npm run test:release
npm run test:security-policy
npm run test:docs
npm run test:web
npm run build
npm run notices -- --check

go test -race -cover -count=1 ./...
go vet ./...

# A matching Playwright Chromium installation is required.
npm exec -- playwright install chromium
npm run test:e2e
```

瀏覽器測試會啟動實際建置的 Go 執行檔，每個測試使用新的私有目錄，涵蓋真實設定／登入、CRUD、完整排序範圍、備份／還原、CSP、工作階段撤銷、響應式觸控目標、真正的 axe 對比檢查，以及 1000 筆服務的輸入至繪製時間量測。為避免憑證進入產物，已停用 trace、影片及自動失敗截圖；明確產生的截圖只使用合成資料及空白憑證欄位。

建置 Docker 映像後，`npm run test:container` 會驗證真實 Compose 部署、全新資料卷的冷備份復原，以及含 Secure Cookie 與精確 Origin 檢查的 HTTPS。測試需要 Docker／Compose、tar 與 OpenSSL，只會建立自己的隔離資源，且不會安裝主機 CA 或特權模擬器。`npm run scan:image` 使用固定版本的 Trivy 掃描已儲存的映像，不會暴露 Docker daemon socket。未處理的發現會以非零狀態回報並保持可見；經審查的抑制項目會在報告中保留理由與來源，報告僅存於本機且已被 Git 忽略。Verify 工作流程執行原生 amd64／arm64 驗證，不取得登錄檔憑證。Release 工作流程依 `master` 的 Conventional Commits 自動規劃版本與 release notes，並保留明確 tag 的相容路徑。只有兩個架構工作都通過後，才建立自動 tag、將確切已驗證映像發布至 GHCR，並提供版本化執行檔與校驗檔。預覽 dispatch 絕不發布，規劃失敗仍會執行原始碼驗證；詳見[發行設定與操作](docs/zh-Hant/releases.md)。兩個流程都不會將應用程式部署至遠端伺服器。

HTTP 契約位於 [api/openapi.yaml](api/openapi.yaml)；產生的 JSON 與 TypeScript 會檢查是否偏離來源。請勿手動修改產生的檔案。

使用 `npm run dev:web` 啟動 Vite 開發伺服器。它的 `/api` 與 `/assets` 代理指向 `127.0.0.1:8080`；在此隔離開發情境中，應將 Go 程序的公開 Origin 設為 Vite 的 Origin，並明確允許 HTTP Cookie。正式環境不使用 Vite 或其開發伺服器提供服務。

## 授權

Nexa Home 採用 [MIT 授權](LICENSE)。第三方相依套件保留各自的授權。重新散布執行檔或映像時，請保留 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；執行期映像在 `/usr/share/licenses/nexa-home/` 包含這兩份檔案。`npm run notices -- --check` 會驗證鎖定相依套件的清單與保留文字。授權原文不因本翻譯而變更；閱讀方式請見[第三方授權來源說明](licenses/readme.zh-Hant.md)。
