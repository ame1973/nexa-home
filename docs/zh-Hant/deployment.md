# 部署

[English](../deployment.md) | **繁體中文**

## 先決條件

- Linux `amd64`（x86-64）或 `arm64`（AArch64）主機，或執行 Linux 容器的 Docker。
- 支援 BuildKit 的 Docker，以及 Compose v2.24.4 或更新版本，以使用本文件提供的命令／測試。原生執行檔不需要 Node 執行環境；Docker 建置會自動取得固定版本的 Node／Go 建置器映像。
- 私有、可寫入且持久保存的**本機**儲存空間。請勿將使用中的 SQLite 放在 NFS／SMB、同步資料夾或多寫入者共用資料卷。
- 遠端存取需要 HTTPS 反向代理與可信任憑證，並以防火牆防止繞過代理。

請從經審查的原始碼工作目錄與相依套件鎖定檔建置。本文件採本機建置，不假設已有公開登錄檔映像或版本標籤。若要直接使用既有已發布映像而不重新建置，請依[發行指南](releases.md#使用已發布映像)操作。

## Docker Compose

在儲存庫根目錄執行：

```sh
cp deploy/.env.example deploy/.env
```

編輯 `deploy/.env`。正式 HTTPS 部署應設定瀏覽器實際使用的 Origin，並保持停用非安全 Cookie：

```dotenv
NEXA_IMAGE=nexa-home:1.0.0
NEXA_HOST_BIND=127.0.0.1
NEXA_HOST_PORT=8080
NEXA_PUBLIC_ORIGIN=https://home.example.com
NEXA_TRUSTED_PROXY_CIDRS=
NEXA_ALLOW_HTTP_COOKIE=false
NEXA_LOG_LEVEL=info
```

將 `home.example.com` 換成自己的網域。代理信任清單留白是安全的：程式會使用直接連線端的位址，而非不可信的轉送用戶端位址。只有確定代理拓樸時，才設定範圍狹窄且正確的代理端 CIDR。

建置並啟動：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up --detach --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T nexa-home /nexa-home healthcheck
```

預設具名資料卷為 `nexa-home_nexa_data`。一般升級請維持相同的 Compose 專案名稱。不同的 `--project-name` 會刻意建立不同儲存空間；若意外看到首次設定畫面，應停止並檢查掛載，而不是覆寫或初始化舊安裝。

請在**本機**讀取一次性設定權杖：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml logs nexa-home
```

初始化前的啟動日誌包含有效憑證。請勿貼到 issue 或公開終端錄影。於已設定的 HTTPS Origin 開啟 `/setup`，建立管理員後登入。系統沒有預設帳戶／密碼。權杖 30 分鐘後到期；重新啟動尚未初始化的服務會產生新權杖。

執行期採用 scratch 映像：UID／GID `10001:10001`、私有 `/data`、不含 shell／Node／編譯器／套件管理器、移除 capabilities、啟用 no-new-privileges，並使用唯讀根檔案系統。`/tmp` 是 16 MiB 的 noexec／nosuid／nodev tmpfs。Compose 提供 512 MiB 記憶體上限、128 個 PID 上限、有大小限制的 JSON 日誌，以及 40 秒停止寬限，讓應用程式完成 30 秒的關機收尾。若修改部署資源，請在新限制下測試匯入與正常關機。

請勿加入 Docker socket、特權模式、主機網路或無關主機掛載。`docker compose exec ... sh` 不是維護介面；請改用 `healthcheck`、`doctor` 與備份介面。

## 隔離 HTTP 例外

回送位址測試可將本機環境檔改為：

```dotenv
NEXA_HOST_BIND=127.0.0.1
NEXA_HOST_PORT=8080
NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080
NEXA_TRUSTED_PROXY_CIDRS=
NEXA_ALLOW_HTTP_COOKIE=true
```

使用相同的 `up` 命令重建服務，並開啟 `http://127.0.0.1:8080`。其他機器上的瀏覽器無法連到 NAS 的回送位址。若刻意部署在隔離 LAN，請綁定 NAS 實際的 LAN 位址，並設定相符的 `http://NAS-LAN-IP:port` Origin，同時將連接埠限制於該可信任 LAN。**請勿將此 HTTP 例外暴露至網際網路。** 遇到憑證錯誤時，應修正憑證或可信任 CA，而非降低 TLS 檢查。

## HTTPS 與代理信任

[NGINX 站台範例](../../deploy/nginx.conf.example) 應放在既有的 `http {}` 區塊中。請提供自己的憑證／私密金鑰、替換主機名稱，並視需要調整回送後端連接埠。TLS 在代理端終止；Nexa Home 本身在後方提供 HTTP。

範例會：

- 保留所有路徑與原始主機，包括非預設連接埠。
- 在單一邊界代理處取代傳入的轉送用戶端歷程。
- 允許 16 MiB 備份主體、停用共用快取，並避免代理將請求主體／回應暫存至磁碟。
- 允許五分鐘的匯入回應時間，但不取代應用程式本身的限制。
- 保留應用程式 CSP 與其他安全標頭，並加入只作用於該主機的 HSTS。只有確定會持續使用 HTTPS 的主機名稱才應啟用 HSTS；範例不使用 preload，也不涵蓋無關子網域。

請在既有代理／NAS 服務設定 HTTP 至 HTTPS 重新導向及憑證更新。應發布在 `/`，而非 `/nexa/`。請勿在代理加入獨立 SPA fallback、靜態 `/assets/` 別名、共用 API 快取、寬鬆 CORS 標頭，或允許 `unsafe-inline` 指令碼的 CSP。

`NEXA_PUBLIC_ORIGIN` 必須是精確的瀏覽器 Origin。轉送的主機／通訊協定標頭不會重新定義它。主機反向代理經 Docker 發布的連接埠連線時，應用程式可能看到 Docker bridge gateway，而非 `127.0.0.1`。若需要準確轉送用戶端位址，請先確認實際代理端，再信任該精確位址或專用網段。請勿信任所有位址或無關容器。信任清單留白比猜測安全。

## 儲存與綁定掛載

具名資料卷會繼承映像的 `10001:10001` 擁有權與 `0700` 目錄權限。應用程式以 `0600` 建立資料庫／鎖定檔，並拒絕不安全的既有路徑，不會默默執行 chmod／chown。

若 NAS 工具要求綁定掛載，請先建立新的專用目錄，由 UID／GID `10001:10001` 擁有，權限為 `0700`。請勿遞迴變更既有共用 NAS 目錄的擁有權。可使用以下覆寫設定：

```yaml
services:
  nexa-home:
    volumes:
      - type: bind
        source: /absolute/private/path/nexa-data
        target: /data
        bind:
          create_host_path: false
```

目錄不存在時應失敗，而不是自動建立由 root 擁有、權限為 `0755` 的路徑。先備份並停止服務，再保護既有資料庫／圖示檔案。不要用符號連結作為資料目錄捷徑。同一 `/data` 不可同時由兩個應用程式，或執行中的應用程式與離線 doctor 開啟。

## 原生執行檔

原始碼建置、環境變數與本機啟動方式請見根目錄 [README](../../readme.zh-Hant.md)。使用專用的非 root 使用者執行，並由該使用者擁有私有的絕對資料路徑。執行檔內嵌 SPA，只使用一條 SQLite 連線，不需要 Node 服務或獨立靜態網頁伺服器。

`/healthz` 回報程序是否存活；`/readyz` 檢查資料庫是否就緒。兩者都不會洩露組態或設定憑證。`healthcheck` 使用已設定的本機接聽位址、三秒逾時，不使用環境代理，也不跟隨重新導向；它不會探測已儲存的服務網址。

## 驗證與疑難排解

```sh
# Build only the host's native architecture; works with classic image storage.
docker buildx build --load --file deploy/Dockerfile --tag nexa-home:1.0.0 .
npm run test:container
npm run scan:image
```

容器測試需要 Node 24、鎖定的 npm 相依套件、Docker／Compose、tar 與 OpenSSL。測試只建立隔離且名稱唯一的本機專案，在記憶體內使用啟動憑證，並移除自己的資源；涵蓋真實設定／登入、圖示／目錄、可攜式還原、替換容器、停機封存後復原至全新儲存空間、權限、健康檢查、工作階段與離線 doctor。HTTPS 驗證使用私人測試 CA，不會停用 TLS 驗證。

若要建立本機雙架構索引，但不發布映像：

```sh
docker buildx build --platform linux/amd64,linux/arm64 --load \
  --file deploy/Dockerfile --tag nexa-home:1.0.0 .
```

多平台 `--load` 需要 Docker 的 containerd 映像儲存。使用傳統儲存方式時，請一次建置／載入單一平台，或匯出本機 OCI 封存檔。只有交叉編譯不等於執行期驗收：請在支援 ARM64 的引擎執行 `NEXA_TEST_PLATFORM=linux/arm64 npm run test:container`。可選的 `NEXA_TEST_QEMU=/absolute/path/to/qemu-aarch64` 測試設定，會以唯讀方式掛載使用者模式直譯器，並將它加到測試進入點／健康檢查之前；不會啟用特權模式或註冊主機 binfmt。直譯器不會隨映像提供。CI 定義原生 amd64 與 arm64 工作，但存在工作流程檔案不代表已在託管環境實際執行。

常見問題：

- **重啟後出現首次設定：** 檢查精確的專案／資料卷／資料路徑。保留舊資料卷，並在誤初始化新執行個體前先停止。
- **擁有權錯誤：** 對已停止、專用的資料目錄使用預期 UID 與私有權限。請勿以 `chmod 777` 或刪除 `.nexa.lock` 作為替代方案。
- **登入無法維持：** 檢查 HTTPS、Origin 與 Cookie 政策。不要在公開端點開啟非安全 Cookie。
- **變更操作回傳 403：** 檢查精確外部 Origin、根路徑代理、有效工作階段／CSRF 與用戶端時鐘。請勿停用 Origin 檢查。
- **不健康／未知結構版本：** 在本機檢查受限日誌、停止服務，再執行離線 doctor。請勿重設或覆寫資料庫。
- **Trivy 以非零狀態結束：** 保留報告並評估實際發現。[安全說明](../../SECURITY.zh-Hant.md)中的未使用 OpenPGP 公告規則僅限特定版本／路徑，於 2027-02-01 到期，且從未允許實際的 OpenPGP 執行期匯入。請勿為了讓失敗消失而擴大例外。

變更資料路徑、映像或結構版本前，請先閱讀[備份、升級與復原](backup-and-recovery.md)。不要將全域 Docker prune 當成應用程式維護步驟。
