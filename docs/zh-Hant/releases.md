# 發行版本與容器映像發布

[English](../releases.md) | **繁體中文**

將經審查的變更合併或推送至 **`master`**，就是一般的發布觸發點。工作流程會根據 Conventional Commits 計算版本及 release notes，驗證兩種原生 Linux 架構後，才建立 tag 並發布。一般發行不需要手動變更套件版本或建立 tag。本文件說明已設定的行為，**不代表**已有託管執行紀錄、tag、GitHub Release 或登錄檔映像。本機建置／測試命令不會發布。

## 登錄檔與儲存庫設定

映像使用 `ghcr.io/<owner>/<repository>`，即目前 GitHub 儲存庫名稱的小寫形式。只有發布工作透過短期 `GITHUB_TOKEN` 取得 `contents: write` 與 `packages: write`。規劃、PR 檢查與原生驗證維持唯讀；不需要 Docker Hub 帳戶、長期 PAT 或 npm 發布密鑰。

啟用自動發行前：

1. 啟用 GitHub Actions，並確認儲存庫／組織政策允許發布工作要求的權限。
2. 設定名為 `release` 的 environment，允許 **`master` 與預定的 `v*` tag**。需要時加入必要審核者。未設定審核者時，已設定的流程會自動執行；僅在 YAML 指定環境名稱不會要求核准。
3. 保護 `master`，要求經審查的 PR、成功的原生驗證與 **Conventional PR title**，並啟用 squash merge，以 **PR 標題與描述**作為 squash commit 訊息。輕量的標題工作流程也會在編輯標題後重跑，但不會取代原始碼驗證檢查。直接推送必須審慎處理：直接推送可發行變更至 `master` 同樣會發布。
4. 保護版本 tag，避免未授權的建立／更新，同時允許發行身分建立新 tag。不要授予覆寫已發行 tag 的權限。Workflow、發行工具與 lockfile 變更都屬於可執行的發布政策，必須審查。
5. 若 GHCR 套件已存在，允許目前儲存庫的 Actions 存取。首次推送後檢查可見性：套件最初可能是私人套件。若要匿名拉取，擁有者必須明確開放公開存取；流程不會變更可見性。
6. 導入前確認發行基準。若沒有成功發布的版本，第一批相關變更會發行 `1.0.0`。既有成功的 `v1.0.0` 是基準，不是可重新建立的版本。草稿、預發行及無關 tag 不會成為自動穩定發行的基準。

流程會發布下載資產／映像，不會將應用程式部署到 NAS 或遠端伺服器。將此工作流程導入 `master`，本身就可能觸發第一次真正發行。

## Commit 與版本規則

從來源 commit 可追溯的最近成功穩定版本之後，取最高變更等級，決定單一新版本：

| Commit | 從 `1.4.2` 開始的結果 |
| ------ | -------------------- |
| `fix: correct a defect` | Patch：`1.4.3` |
| `perf: reduce search work` | Patch：`1.4.3` |
| `feat: add a feature` | Minor：`1.5.0` |
| `feat!: change behavior`、`fix(api)!: change a contract`，或 `BREAKING CHANGE:` footer | Major：`2.0.0` |
| 僅有 `docs`、`test`、`ci`、`chore`、`build`、`style` 或一般 `refactor` | 執行驗證，但不發行 |

任何 type 的 breaking change 都會發行 major 版本。同一範圍內的 feature 及其相符 revert 會互相抵銷。PR 標題必須使用允許的 Conventional Commits type；任意標題無法通過檢查。除非儲存庫合併設定會保留 PR 描述，否則不要假設 squash 後仍有描述內容。

版本 tag 為 `vMAJOR.MINOR.PATCH`，可帶手動預發行識別，例如 `v1.1.0-rc.1`。數字版本／預發行識別不可有前置零；不接受空識別、空白字元及 `+build` 中繼資料。Docker 版本標籤不含 `v`，最多 128 個 ASCII 字元。自動發行只針對 `master` 的穩定版本；不新增 beta／next 分支。

## 版本檔案與原始碼建置

成功發行的 tag 是版本依據。根目錄 `package.json`、`apps/web/package.json` 及對應 lockfile 項目維持一致的**開發基準版本**，不是每次發行自動提交的版本帳本。驗證會檢查綁定來源的計畫，在暫存 checkout 中同步所有版本欄位，再進行建置。不會將版本變更或產生的 CHANGELOG commit 推回 `master`。

`npm run build` 優先使用 `NEXA_BUILD_VERSION`，其次是 checkout commit 上的確切版本 tag，最後才使用開發基準。若本機有多個版本 tag，必須明確指定覆寫值。沒有 Git 的原始碼封存檔，重現發行時也必須指定版本。例如，下列只會在本機建置，不會發布：

```sh
NEXA_BUILD_VERSION=1.1.0 npm run build
./bin/nexa-home version
```

直接 Go 建置需要相應的 `-ldflags "-X main.version=VERSION"`。手動 Docker 建置必須傳入相符的 `VERSION` build argument；本機後備值仍為 `1.0.0`。CI 一律傳入計畫版本、確切來源 revision／source URL。請保留 Go 符號，以便分析執行檔弱點。

兩個官方 semantic-release 分析 plugin 與 Conventional Commits preset 都是精確鎖定的開發工具。流程直接呼叫其獨立 API，不執行完整發行引擎。`.npmrc` 停用 peer 自動安裝，避免拉入未使用的 semantic-release／npm 發布用戶端；Docker 建置使用相同安裝旗標。前端需要的 peer 已明確宣告。這是選擇依賴，不是排除稽核：完整已安裝／鎖定的開發依賴稽核仍是閘門。

## 自動 release notes

官方 commit analyzer 與 release-notes generator 使用同一份 Conventional Commits preset 和 commit 範圍。Notes 包含功能、修正、效能變更、breaking 描述、已有的 commit／issue／PR 參照，以及前一個 tag 至本次 tag 的比較連結。保留英文 commit 描述；不使用 AI 翻譯或外部文字服務。

發行日期使用來源 commit 的 UTC 日期，使規劃／重跑可重現。有大小限制的計畫透過 SHA-256 綁定版本、來源 SHA、前一個發行 SHA／tag、變更等級、日期及生成的 notes。兩種架構的 manifest 都必須帶有此識別。GitHub Release 內文使用這份確切 notes，再附上映像／授權資訊及經驗證的不可變映像 digest；不把變更選擇交給 GitHub 通用的 generated-notes 命令。

GitHub Releases 是自動產生的逐版歷程。儲存庫的 `CHANGELOG.md` 與繁體中文對應檔仍為人工維護的摘要；產品手冊不會在每次發行時被機器翻譯或自動改寫。

## 驗證與發布順序

[Release](../../.github/workflows/release.yaml) 在推送 `master`、相容的手動 tag，或明確 dispatch 時規劃發行。它取得完整歷史／tag，並以唯讀權限讀取已發布版本，再呼叫分支／PR 使用的同一份 [Verify 工作流程](../../.github/workflows/ci.yaml)；`master` 不會額外觸發重複的獨立 Verify push 執行。不發行的變更仍執行完整驗證。若規劃失敗，一般原始碼驗證仍會執行，但不產生版本化產物，且維持阻擋發布。

原生 `ubuntu-24.04` amd64 與 `ubuntu-24.04-arm` arm64 工作會執行：

1. Workflow 語法檢查、產生契約／API／文件／政策檢查、TypeScript、ESLint 與建置相容性檢查。
2. 發行工具／前端測試、內嵌應用程式建置、授權清單、Go race／vet 及輸入 fuzz 測試。前端測試的並行數有上限，不移除任何測試或 timeout。
3. 相依套件稽核、原始碼／執行檔弱點掃描，並明確拒絕直接／轉移 OpenPGP 執行期匯入。
4. 實際建置應用程式的 Chromium E2E 套件。
5. 注入版本／revision 的原生 OCI 建置、真實 Compose／HTTPS／冷復原驗收，以及符合政策的映像掃描。
6. 從確切映像擷取執行檔、驗證 ELF 架構／回報版本、建立可攜式封存檔，再執行一次執行檔弱點掃描。

驗證與發布共用同一份 [Docker 工具鏈](../../.github/actions/docker-toolchain/action.yaml)。由 Docker 維護且以 SHA 固定的 `docker/setup-docker-action` 與 `docker/setup-buildx-action`，安裝 Docker **29.5.3**（用戶端與 daemon）及 Buildx **0.38.2**，明確選取新安裝的 daemon，並啟用 containerd 映像儲存。`docker` builder driver 使用該 daemon；原生工作不需要模擬器或額外的特權 builder 容器。提早執行的版本／API 檢查會拒絕不支援的用戶端或 daemon，而不是移除映像檢查／匯出的平台選擇。

`docker/build-push-action` 使用 checkout 的路徑 context（`.`）建置，因此經驗證的暫存版本同步會納入建置，不會被預設 Git context 忽略。設定為 `load: true`、`outputs: type=docker,oci-mediatypes=true` 與 `push: false`，透過 containerd 映像儲存，在檢查、儲存／載入及推送期間保留 OCI manifest。若未明確指定 OCI media type，Buildx 可能將 Docker 格式來源組成 Docker manifest list，並悄悄省略要求的索引註記。發布工作要求 OCI index 及完整的版本／revision／source 註記，不會略過這些檢查。對外發布前，先完成部署驗收、無憑證的回送登錄檔往返驗證及掃描。登錄檔測試會檢查註記保留、執行期 digest 不變及 `latest` 精確更新，不會將 daemon socket 暴露給輔助容器。Docker build record 上傳與 build summary 已停用，只保留明確宣告的計畫及架構產物。

有版本的計畫才匯出兩種已驗證架構的產物；不發行的驗證不會匯出。同一次 run 的計畫／產物七天後到期。上傳僅包含明確宣告的公開建置檔，不包含應用程式資料、憑證、啟動日誌、瀏覽器 trace 或本機過程報告。重跑只取代同一次 run 自己的同名產物；下載不會選取其他 run。

只有通過 environment 閘門的發布工作取得寫入權限。它在登入登錄檔前檢查計畫雜湊與完整產物集合，再透過以 SHA 固定的 `docker/login-action`，使用私有 `DOCKER_CONFIG`、該工作的短期權杖及工作結束後的登出。接著重新確認已發布基準，在已測試 SHA 建立自動附註 tag，再建立自己的草稿。Tag 包含有大小限制的公開計畫收據，因此不必依賴已到期的 Actions 產物即可復原。既有自動 tag 必須與該確切收據相符；不會悄悄接管人工管理的 tag。

發布工作載入並推送已測試的映像封存檔，**不重新建置**。不會再次呼叫 `build-push-action`；保留的 `docker load`／`tag`／`push` 與 `buildx imagetools` 命令，發布的是已驗證映像，不是另一次建置。推送後的不可變 digest 組成雙平台索引，其執行期 descriptor 必須與已驗證架構一致。上傳資產／notes，重新檢查 tag／基準後，才公開草稿。由 `GITHUB_TOKEN` 建立的 tag 不會再觸發另一個 push workflow；此流程直接完成，不依賴遞迴觸發。

所有發行共用不取消進行中工作的 workflow concurrency group，發布亦序列化。GitHub concurrency 不是 FIFO 佇列，可能取代等待中的 run；後續規劃會涵蓋尚未成功發行的 commit。經審查的未使用 OpenPGP 例外仍有條件、精確版本／路徑範圍與到期日，詳見[安全說明](../../SECURITY.zh-Hant.md)。閘門失敗／到期時會阻擋發布，而不是放寬政策。

## 預覽與相容的手動 tag

手動 dispatch 預設為**預覽**，包含唯讀規劃與完整驗證，但不寫入 tag、登錄檔或 Release。以下命令會啟動託管 workflow，不是本機測試：

```sh
gh workflow run release.yaml --ref master -f mode=preview
```

在 run 摘要與 `release-plan` 產物檢視計畫／notes。一般經審查後合併至 `master` 的變更，不需要版本命令或 tag 命令。

有權限的維護者仍可刻意使用尚未用過的明確版本 tag，發布經審查的 commit，包括預發行／舊版本回補。這會覆寫自動版本選擇，但不會略過驗證。以下命令是**發布觸發點**，不是測試：

```sh
VERSION=1.1.0-rc.1
git tag -a "v$VERSION" -m "Nexa Home $VERSION"
git push origin "v$VERSION"
```

不要只為了此 tag 而手動變更開發套件版本。流程會在隔離建置中同步所選 tag 的版本。Tag 來源必須包含經審查的 workflow／工具。不可強制推送既有版本 tag。

## 映像標籤與 latest

| 參照 | 意義 |
| ---- | ---- |
| `ghcr.io/owner/repository:1.1.0` | Linux amd64／arm64 穩定版本索引 |
| `ghcr.io/owner/repository:1.1.0-rc.1` | 手動預發行索引；不會更新 `latest` |
| `ghcr.io/owner/repository:latest` | 僅在穩定版本高於既有已發布穩定版本時更新 |
| `ghcr.io/owner/repository@sha256:...` | 發行紀錄中的確切索引 digest |
| `build-<run>-<attempt>-<arch>` | 內部暫存標籤，不是部署別名 |

較舊穩定版本的回補不會讓 Docker `latest` 或 GitHub Latest 倒退。不會自動建立 major／minor 別名。已發布版本標籤應視為不可變；精確部署請使用索引 digest。

## 下載資產與完整性

每個 GitHub Release 提供：

- `nexa-home_VERSION_linux_amd64.tar.gz`
- `nexa-home_VERSION_linux_arm64.tar.gz`
- `image-digest.txt`：完整登錄檔索引 digest
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

AArch64 應使用 `ARCH=arm64`。校驗碼用來偵測損毀，不是另一套識別發布者的簽章系統；請確認儲存庫與 HTTPS Origin。啟動前應依 [readme](../../readme.zh-Hant.md#在本機執行)設定私有資料目錄與傳輸選項。

## 使用已發布映像

若要在沒有原始碼工作目錄的情況下，只透過映像部署，可使用根目錄的 [compose.yaml](../../compose.yaml) 與 [.env.example](../../.env.example)。部署指南包含獨立快速啟動、HTTPS 設定與持久性資料卷說明。它預設使用上游穩定版 `latest`；若要控制部署，請將 `NEXA_IMAGE` 設為預定的儲存庫／版本或不可變索引 digest。既有的原始碼建置 Compose 也仍可搭配明確映像覆寫與 `--no-build` 使用，如下所示。

將下列擁有者／儲存庫與版本，改為確實存在的發行版本：

```sh
IMAGE=ghcr.io/owner/repository
VERSION=1.1.0
docker pull "$IMAGE:$VERSION"
docker buildx imagetools inspect "$IMAGE:$VERSION"
```

在被 Git 忽略的 `deploy/.env` 中，將 `NEXA_IMAGE` 設為版本參照，或使用 `image-digest.txt` 中的確切參照。保留[部署文件](deployment.md)中的 HTTPS／Origin／資料設定。不要以本機重新建置取代已發布映像：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml pull
docker compose --env-file deploy/.env -f deploy/compose.yaml \
  up --detach --no-build --pull always --wait
```

索引會選取主機的 Linux 架構。私人套件需要適當的登錄檔登入；不可把憑證寫入 Compose、映像網址或公開日誌。

## 重跑與失敗復原

建立 tag 前，應以原始 SHA 重跑原來的 `master` run。自動 tag 建立後，可重跑該 run，或明確接續相同且不可變的 tag：

```sh
VERSION=1.1.0
gh workflow run release.yaml --ref "v$VERSION" -f mode=resume
```

在分支上使用 `resume` 會被拒絕；預設的 `preview` 絕不發布。即使透過 tag dispatch，自動 tag 的計畫收據仍會保留原始變更等級、基準、notes 與雜湊。產物到期後，必須重新完整驗證，不能略過閘門。手動 tag 只能接續相同計畫的草稿。已發布 Release 在規劃時會視為無需動作，不能覆寫。

若未完成版本屬於較早 SHA，之後的 `master` commit 不能接管該版本或移動其 tag。若是暫時性的服務／存取失敗，先接續原始來源，再由後續規劃涵蓋新增變更。已發布基準變動、tag 被移動、收據遭修改或草稿不屬於本流程時，都會停止發布。應檢查並處理確切狀態，不可自動刪除／取代 tag。

若既有 tag 指向的來源具有 **workflow／發布程式的程式碼缺陷**，重跑舊 SHA 或對該 tag 執行 dispatch，仍會執行舊程式碼。應先將經審查的修正合併至 `master`，再刻意從該已修正的 master commit，發布**尚未使用的較高明確版本**。例如，已有未完成的 `v1.0.0`，且 `v1.0.1` 尚未使用時，可選擇 `v1.0.1`。保留原 tag、映像狀態與草稿，不移動 tag，也不把新來源塞入舊計畫。在新的成功發行提供基準前，自動規劃可能會刻意拒絕被占用的版本；較新版本成功後，一般自動發行即可從該基準繼續。

以下是**發布觸發命令**，不是測試。執行前，將 `FIXED_SOURCE` 改為 `master` 上經審查且已修正的完整 commit SHA，並確認版本尚未使用：

```sh
VERSION=1.0.1
FIXED_SOURCE=replace-with-full-reviewed-master-commit
git tag -a "v$VERSION" -m "Nexa Home $VERSION" "$FIXED_SOURCE"
git push origin "v$VERSION"
```

新 tag 仍會執行全部原生驗證及發布閘門，不會略過檢查或覆寫未完成的發行。

GHCR 與 GitHub Releases 不是原子交易。失敗／取消時，可能在 GitHub Release 公開前留下附註 tag、暫存／版本／latest 映像狀態，或流程自己的未發布草稿。不會自動刪除登錄檔版本或已發布 Release。請在儲存庫／套件設定修正權限與可見性，不要把長期憑證寫入原始碼。請勿為了通過發行閘門而停用 TLS 或放寬安全例外。環境審核、tag／分支保護及存取控制，仍由維運者負責。
