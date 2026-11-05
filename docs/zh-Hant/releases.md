# 發行版本與容器映像發布

[English](../releases.md) | **繁體中文**

儲存庫已提供由版本 tag 觸發的發行工作流程。本文件說明該流程將執行的行為，**不代表**目前已有 tag、GitHub Release、登錄檔映像，或已執行託管工作流程。推送符合規則的 tag，或在 tag 上手動觸發流程，即表示授權對外發布。本機建置與驗證命令不會發布任何內容。

## 登錄檔與儲存庫設定

映像發布至 `ghcr.io/<owner>/<repository>`，使用目前 GitHub 儲存庫名稱的小寫形式。不需要 Docker Hub 帳戶或長期有效的登錄檔密鑰。發布工作使用短期 `GITHUB_TOKEN`，只在該工作授予 `contents: write` 與 `packages: write`；一般分支／PR 驗證仍維持 `contents: read`。

首次發行前：

1. 啟用 GitHub Actions，並確認儲存庫／組織政策允許發行工作要求的權限。
2. 設定名為 `release` 的 GitHub environment，依需求加入必要審核者與版本 tag 部署限制。在 YAML 指定環境名稱，**不會**自動啟用審核。
3. 保護版本 tag，並審查 workflow、發行指令碼與相依套件 lockfile 的變更。具有建立 tag 或維護 workflow 權限的人，屬於可發布執行碼的信任範圍。
4. 若 GHCR 套件已存在，請允許目前儲存庫的 Actions 存取該套件。映像的 source 標籤會將它與儲存庫關聯。
5. 首次推送後檢查套件可見性。GHCR 套件最初可能是私人套件；若要允許匿名拉取，擁有者必須明確開放公開存取。此流程不會變更可見性。

此工作流程發布映像與下載產物，不會將應用程式部署到 NAS 或其他伺服器。

## 版本規則

- Git tag 必須為 `vMAJOR.MINOR.PATCH`，可附加 SemVer 預發行識別，例如 `v1.1.0-rc.1`。
- 移除 `v` 後的版本，必須與根目錄 `package.json`、`apps/web/package.json`，以及 `package-lock.json` 中對應的兩個項目一致。
- 不接受數字版本欄位或純數字預發行識別前方的零、空識別、空白字元或建置中繼資料（`+build`）。映像版本最多 128 個 ASCII 字元。
- Go 執行檔版本與 OCI 版本標籤由驗證後的版本注入；OCI revision／source 標籤識別實際 checkout 的 commit 與儲存庫。支援輕量與附註 tag。
- 不可移動已發行的 tag。流程會在寫入發行狀態前，以及最終更新前，再次確認遠端 tag 仍指向已驗證的 commit。
- 已發布的 GitHub Release 不會被覆寫；修正需要新的版本。只允許接續同一條流程為相同 commit 建立、尚未完成的草稿。

`npm run build` 會將根套件版本注入原生執行檔。直接執行 Go 建置且需要指定版本時，應提供相應的 `-ldflags "-X main.version=VERSION"`。手動 Docker 建置應傳入相符的 `VERSION` build argument；既有本機預設值為 `1.0.0`，CI 則一律明確傳入經驗證的來源版本。

## 準備並觸發發行

使用經審查的原始碼工作目錄與明確版本。以下範例準備未來的穩定版本，不代表 `1.1.0` 已發行：

```sh
VERSION=1.1.0
npm version "$VERSION" --workspaces --include-workspace-root \
  --no-git-tag-version --ignore-scripts
node scripts/release.mjs version
npm run test:release
npm run build
npm run notices -- --check
```

更新英文／繁體中文更新紀錄及發行文件，執行一般[驗證套件](../../readme.zh-Hant.md#開發與驗證)，再提交並審查變更。上述 npm 命令只更新兩個套件版本與 lockfile，不會建立 Git commit／tag，也不執行套件生命週期指令碼；它不會發布 npm 套件。

審查／合併後，請 checkout 真正預定發行的 commit。下列命令是**對外發布觸發點**，不是本機測試：

```sh
VERSION=1.1.0
git tag -a "v$VERSION" -m "Nexa Home $VERSION"
git push origin HEAD
git push origin "v$VERSION"
```

若不變更版本而直接發行目前的 `1.0.0` 原始碼，應先審查該確切來源，再使用 `VERSION=1.0.0`。不可強制推送既有版本 tag。

## 驗證與發布順序

[Release](../../.github/workflows/release.yaml) 驗證 tag／版本後，會呼叫分支／PR 使用的同一份 [Verify 工作流程](../../.github/workflows/ci.yaml)。原生 `ubuntu-24.04` amd64 與 `ubuntu-24.04-arm` arm64 工作會執行：

1. Workflow 語法檢查、產生契約／API／文件／政策檢查、TypeScript、ESLint 與建置相容性檢查。
2. 發行工具與前端測試、內嵌應用程式建置、授權清單、Go race／vet，以及輸入 fuzz 測試。
3. 相依套件稽核、原始碼／執行檔弱點掃描，並明確拒絕直接／轉移 OpenPGP 執行期匯入。
4. 實際建置應用程式的 Chromium E2E 套件。
5. 注入版本／revision 的原生 OCI 建置、真實 Compose／HTTPS／冷復原驗收，以及符合政策的映像掃描。
6. 從該確切映像擷取執行檔、驗證 ELF 架構與回報版本、建立可攜式封存檔，再執行一次執行檔弱點掃描。

只有成功完成 tag 驗證，才會匯出兩種架構的產物。內容僅限明確宣告的公開建置檔，不包含應用程式資料、瀏覽器 trace、啟動日誌、憑證或本機開發過程報告。暫存產物七天後到期；重跑只能取代同一次 run 自己的同名架構產物，下載也僅限目前工作流程 run。

獨立的 `release` environment 發布工作會先驗證完整產物集合、來源識別與 SHA-256，再登入登錄檔。它載入已檢查的映像封存檔後直接推送，**不重新建置**。推送後的不可變 digest 會組合為雙平台索引；確認其執行期 descriptor 與兩個已測試架構一致後，才會上傳發行資產並發布草稿。

經審查的未使用 OpenPGP 例外仍附有條件、版本／路徑範圍及到期日，不會略過受影響套件／符號檢查；詳見[安全說明](../../SECURITY.zh-Hant.md)。安全閘門失敗或政策到期時，會阻止發布，而不是放寬政策。

## 映像標籤與 latest

| 參照 | 意義 |
| ---- | ---- |
| `ghcr.io/owner/repository:1.1.0` | Linux amd64 與 arm64 的穩定版本索引 |
| `ghcr.io/owner/repository:1.1.0-rc.1` | 預發行索引；不會更新 `latest` |
| `ghcr.io/owner/repository:latest` | 僅在穩定版本高於既有已發布穩定版本時更新 |
| `ghcr.io/owner/repository@sha256:...` | 發行紀錄中的確切索引 digest |
| `build-<run>-<attempt>-<arch>` | 組合索引使用的內部暫存標籤，不是部署別名 |

Git tag 包含 `v`，Docker 版本標籤則不包含。較舊穩定版本的回補不會讓 Docker `latest` 或 GitHub Latest 標記倒退。沒有自動建立 major／minor 別名。已發布版本標籤應視為不可變；若需要確切部署版本，請固定使用索引 digest。

## 下載資產與完整性

每個 GitHub Release 提供：

- `nexa-home_VERSION_linux_amd64.tar.gz`
- `nexa-home_VERSION_linux_arm64.tar.gz`
- `image-digest.txt`：完整的登錄檔索引 digest 參照
- `SHA256SUMS`：涵蓋兩個封存檔與 `image-digest.txt`

每個執行檔封存檔僅包含 `nexa-home`、`LICENSE` 與 `THIRD_PARTY_NOTICES.md`，不含 Node、Go、測試工具或應用程式資料。重新散布時請保留授權原文。

從預定儲存庫的 HTTPS 發行頁，將四個資產下載到空目錄，再驗證並解開適當架構：

```sh
VERSION=1.1.0
ARCH=amd64
sha256sum --check SHA256SUMS
mkdir "nexa-home_${VERSION}_${ARCH}"
tar -xzf "nexa-home_${VERSION}_linux_${ARCH}.tar.gz" \
  -C "nexa-home_${VERSION}_${ARCH}"
"./nexa-home_${VERSION}_${ARCH}/nexa-home" version
```

AArch64 主機應使用 `ARCH=arm64`。校驗碼用來偵測損毀，不是另一套數位簽章系統；請確認儲存庫與 HTTPS Origin。啟動應用程式前，應依[readme](../../readme.zh-Hant.md#在本機執行)設定私有資料目錄與傳輸方式。

## 使用已發布映像

將下列擁有者／儲存庫與版本，改為確實存在的發行版本：

```sh
IMAGE=ghcr.io/owner/repository
VERSION=1.1.0
docker pull "$IMAGE:$VERSION"
docker buildx imagetools inspect "$IMAGE:$VERSION"
```

在被 Git 忽略的 `deploy/.env` 中，將 `NEXA_IMAGE` 設為該版本參照，或使用 `image-digest.txt` 中的確切 digest。保留[部署文件](deployment.md)中的 HTTPS／Origin／資料設定。拉取並執行時，不要以本機重新建置取代已發布映像：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml pull
docker compose --env-file deploy/.env -f deploy/compose.yaml \
  up --detach --no-build --pull always --wait
```

Manifest 會自動選擇主機的 Linux 架構。私人套件需要適當的登錄檔登入；請勿把憑證寫入 Compose、映像網址或公開日誌。

## 重跑與失敗復原

可使用 GitHub Actions 的重跑控制，或明確在相同且不可變的版本 tag 上手動觸發 Release：

```sh
VERSION=1.1.0
gh workflow run release.yaml --ref "v$VERSION"
```

在分支上手動觸發會無法通過 tag 驗證。GitHub Actions 必須能存取工作流程檔，且所選 tag 必須包含經審查的發行設定。

GHCR 與 GitHub Releases 之間不是單一原子交易。失敗／取消時，可能留下暫存標籤、流程自己建立但尚未發布的草稿，或在 GitHub Release 公開前已更新的版本映像／latest 別名。請檢查 run 與 digest，維持相同 tag／commit 再重跑。流程只能接續它為該 commit 建立的草稿，不會自動刪除登錄檔版本或已發布 Release。若產物已過期或前置條件變更，應重跑完整驗證，不能略過閘門。已發布的 Release 不可透過重跑取代，應準備新版本。

權限／可見性問題應在儲存庫與套件設定中修正，不要把長期權杖加入原始碼。請勿為了通過發行而停用 TLS 檢查或放寬安全例外。環境審核、tag 保護與儲存庫存取控制，仍由維運者負責。
