export const themeEn = {
  themeStyles: "Theme styles",
  themeStylesHint:
    "Choose a style. Light/dark mode, density and glass stay independent.",
  themeFutureGlass: "Future Glass",
  themeGraphite: "Graphite",
  themeTide: "Tide",
  themeForest: "Forest",
  themeDune: "Dune",
  futureGlassHint: "Translucent console and grouped cards",
  graphiteHint: "Compact gray index and horizontal rows",
  tideHint: "Teal sections with side headings",
  forestHint: "Green shelves and compact service rows",
  duneHint: "Warm centered gallery and large icons",
  customTheme: "Custom theme",
  customizeTheme: "Customize a copy",
  themeCopyName: "{name} copy",
  themeBackground: "Background",
  themeSurface: "Surface",
  themeRadius: "Corner radius",
  themeShadow: "Shadow",
  shadowNone: "None",
  shadowSoft: "Soft",
  themeTokensHint:
    "Choose background, surface and accent for both variants. Text, control and focus colors are derived automatically.",
  invalidTheme:
    "Use theme schema 1, a name of 1–80 characters, hex colors and surfaces that share readable text (4.5:1).",
  themeLibrary: "Saved themes",
  themeLibraryHint:
    "Up to 10 token themes in this browser only. CSS is stored separately.",
  themeSaveLibrary: "Save to this browser's library",
  themeUpdateLibrary: "Update saved theme",
  themeLibraryFull:
    "This browser already has 10 themes. Delete one before adding another.",
  themeStorageError:
    "Browser storage is unavailable or full. Your draft is kept; allow storage and try again.",
  themeLibrarySaved: "Theme saved to this browser.",
  useSavedTheme: "Use {name}",
  deleteSavedTheme: "Delete {name}",
  deleteThemeTitle: "Delete this saved theme?",
  deleteThemeHint:
    "Only this browser copy is removed. The active appearance and site settings stay unchanged.",
  importTheme: "Import theme JSON",
  importThemeHint: "UTF-8 token JSON, up to 16 KiB; no CSS or unknown fields.",
  confirmThemeImport: "Use imported theme",
  invalidThemeFile:
    "Choose a valid UTF-8 theme JSON file, at most 16 KiB, without duplicate or unknown fields.",
  exportTheme: "Export theme JSON",
  themeDownload: "Theme download started.",
  advancedCSS: "Advanced CSS",
  cssWarning:
    "CSS can hide controls or impair accessibility. Only use trusted CSS; it is not secret. JavaScript and external resources remain blocked by CSP.",
  cssHint:
    "UTF-8 text, up to 64 KiB. Selectors and rules are unrestricted; the browser ignores invalid CSS.",
  cssInvalid: "Use valid UTF-8 CSS without NUL, at most 64 KiB.",
  importCSS: "Import CSS file",
  confirmCSSImport: "Use imported CSS",
  exportCSS: "Export CSS file",
  safeAppearance: "Safe appearance",
  safeAppearanceHint:
    "If a style hides controls, open /?appearance=safe to disable custom themes and CSS. Sign-in is still required.",
  safeAppearanceActive:
    "Safe appearance is active. Custom styles are disabled for this page session.",
  leaveSafeAppearance: "Leave safe appearance",
  themePreviewMode: "Page preview mode",
  themePreviewApply: "Preview on page",
  themePreviewCancel: "Stop preview",
  themePreviewHint:
    "Preview is temporary. Press Escape to restore your appearance; it never saves changes.",
  personalAppearance: "Your appearance",
  personalAppearanceHint:
    "Applies only to this browser. A personal style replaces the site's tokens and CSS; mode remains independent.",
  personalSave: "Use in this browser",
  personalSaved: "Personal appearance saved.",
  useSiteAppearance: "Use site appearance",
  siteAppearanceHint:
    "Shared defaults apply to browsers without a personal style. Advanced CSS is public and included in backups.",
} as const;

type ThemeMessages = Record<keyof typeof themeEn, string>;

export const themeZhHant: ThemeMessages = {
  themeStyles: "主題風格",
  themeStylesHint: "選擇喜歡的風格；深淺模式、密度與玻璃效果維持獨立。",
  themeFutureGlass: "未來玻璃",
  themeGraphite: "石墨",
  themeTide: "潮汐",
  themeForest: "森序",
  themeDune: "沙丘",
  futureGlassHint: "半透明控制台與分組卡片",
  graphiteHint: "灰階緊湊索引與橫向服務列",
  tideHint: "青綠區塊與側邊標題",
  forestHint: "綠色分類書架與精簡服務列",
  duneHint: "暖色置中圖庫與大型圖示",
  customTheme: "自訂主題",
  customizeTheme: "複製並自訂",
  themeCopyName: "{name} 副本",
  themeBackground: "背景",
  themeSurface: "表面",
  themeRadius: "圓角半徑",
  themeShadow: "陰影",
  shadowNone: "無",
  shadowSoft: "柔和",
  themeTokensHint:
    "分別設定深淺兩種版本的背景、表面與強調色。文字、控制項與焦點顏色會自動推導。",
  invalidTheme:
    "請使用主題格式 1、1–80 個字元的名稱、十六進位色碼，以及可共用易讀文字的背景與表面（4.5:1）。",
  themeLibrary: "已儲存的主題",
  themeLibraryHint: "僅在此瀏覽器保存，最多 10 套色彩主題；CSS 另外儲存。",
  themeSaveLibrary: "儲存至此瀏覽器的主題庫",
  themeUpdateLibrary: "更新已儲存的主題",
  themeLibraryFull: "此瀏覽器已有 10 套主題，請先刪除一套再新增。",
  themeStorageError:
    "瀏覽器儲存空間無法使用或已滿。草稿仍保留，請允許儲存後重試。",
  themeLibrarySaved: "主題已儲存至此瀏覽器。",
  useSavedTheme: "使用 {name}",
  deleteSavedTheme: "刪除 {name}",
  deleteThemeTitle: "刪除此已儲存的主題？",
  deleteThemeHint: "只會移除此瀏覽器的副本，不會改變目前外觀或站台設定。",
  importTheme: "匯入主題 JSON",
  importThemeHint:
    "UTF-8 色彩主題 JSON，上限 16 KiB；不可包含 CSS 或未知欄位。",
  confirmThemeImport: "使用匯入的主題",
  invalidThemeFile:
    "請選擇有效的 UTF-8 主題 JSON，上限 16 KiB，且不得包含重複或未知欄位。",
  exportTheme: "匯出主題 JSON",
  themeDownload: "已開始下載主題。",
  advancedCSS: "進階 CSS",
  cssWarning:
    "CSS 可能隱藏控制項或破壞無障礙體驗。請只使用可信任的 CSS，且不要放入機密。CSP 仍會阻擋 JavaScript 與外部資源。",
  cssHint:
    "UTF-8 文字，上限 64 KiB。不限制選擇器與規則；瀏覽器會忽略無效的 CSS。",
  cssInvalid: "請使用不含 NUL 的有效 UTF-8 CSS，上限 64 KiB。",
  importCSS: "匯入 CSS 檔案",
  confirmCSSImport: "使用匯入的 CSS",
  exportCSS: "匯出 CSS 檔案",
  safeAppearance: "安全外觀",
  safeAppearanceHint:
    "若樣式隱藏控制項，開啟 /?appearance=safe 即可停用自訂主題與 CSS；仍須正常登入。",
  safeAppearanceActive: "安全外觀已啟用，本次頁面工作階段不會套用自訂樣式。",
  leaveSafeAppearance: "離開安全外觀",
  themePreviewMode: "頁面預覽模式",
  themePreviewApply: "在頁面預覽",
  themePreviewCancel: "停止預覽",
  themePreviewHint:
    "預覽是暫時的。按 Escape 可還原原本外觀，不會儲存任何變更。",
  personalAppearance: "個人外觀",
  personalAppearanceHint:
    "僅影響此瀏覽器。個人風格會取代站台的色彩與 CSS；深淺模式維持獨立。",
  personalSave: "在此瀏覽器使用",
  personalSaved: "個人外觀已儲存。",
  useSiteAppearance: "使用站台外觀",
  siteAppearanceHint:
    "未選擇個人風格的瀏覽器會使用此共用預設。進階 CSS 是公開內容，並會包含於備份。",
};

export const themeZhHans: ThemeMessages = {
  themeStyles: "主题风格",
  themeStylesHint: "选择喜欢的风格；深浅模式、密度与玻璃效果保持独立。",
  themeFutureGlass: "未来玻璃",
  themeGraphite: "石墨",
  themeTide: "潮汐",
  themeForest: "森序",
  themeDune: "沙丘",
  futureGlassHint: "半透明控制台与分组卡片",
  graphiteHint: "灰阶紧凑索引与横向服务行",
  tideHint: "青绿区块与侧边标题",
  forestHint: "绿色分类书架与精简服务行",
  duneHint: "暖色居中画廊与大型图标",
  customTheme: "自定义主题",
  customizeTheme: "复制并自定义",
  themeCopyName: "{name} 副本",
  themeBackground: "背景",
  themeSurface: "表面",
  themeRadius: "圆角半径",
  themeShadow: "阴影",
  shadowNone: "无",
  shadowSoft: "柔和",
  themeTokensHint:
    "分别设置深浅两种版本的背景、表面与强调色。文字、控件与焦点颜色会自动生成。",
  invalidTheme:
    "请使用主题格式 1、1–80 个字符的名称、十六进制色码，以及可共用易读文字的背景与表面（4.5:1）。",
  themeLibrary: "已保存的主题",
  themeLibraryHint: "仅在此浏览器保存，最多 10 套颜色主题；CSS 单独保存。",
  themeSaveLibrary: "保存至此浏览器的主题库",
  themeUpdateLibrary: "更新已保存的主题",
  themeLibraryFull: "此浏览器已有 10 套主题，请先删除一套再添加。",
  themeStorageError: "浏览器存储不可用或已满。草稿仍保留，请允许存储后重试。",
  themeLibrarySaved: "主题已保存至此浏览器。",
  useSavedTheme: "使用 {name}",
  deleteSavedTheme: "删除 {name}",
  deleteThemeTitle: "删除此已保存的主题？",
  deleteThemeHint: "只会移除此浏览器的副本，不会改变当前外观或站点设置。",
  importTheme: "导入主题 JSON",
  importThemeHint:
    "UTF-8 颜色主题 JSON，上限 16 KiB；不可包含 CSS 或未知字段。",
  confirmThemeImport: "使用导入的主题",
  invalidThemeFile:
    "请选择有效的 UTF-8 主题 JSON，上限 16 KiB，且不得包含重复或未知字段。",
  exportTheme: "导出主题 JSON",
  themeDownload: "已开始下载主题。",
  advancedCSS: "高级 CSS",
  cssWarning:
    "CSS 可能隐藏控件或破坏无障碍体验。请只使用可信任的 CSS，且不要放入机密。CSP 仍会阻止 JavaScript 与外部资源。",
  cssHint:
    "UTF-8 文本，上限 64 KiB。不限制选择器与规则；浏览器会忽略无效的 CSS。",
  cssInvalid: "请使用不含 NUL 的有效 UTF-8 CSS，上限 64 KiB。",
  importCSS: "导入 CSS 文件",
  confirmCSSImport: "使用导入的 CSS",
  exportCSS: "导出 CSS 文件",
  safeAppearance: "安全外观",
  safeAppearanceHint:
    "若样式隐藏控件，打开 /?appearance=safe 即可停用自定义主题与 CSS；仍须正常登录。",
  safeAppearanceActive: "安全外观已启用，本次页面会话不会应用自定义样式。",
  leaveSafeAppearance: "退出安全外观",
  themePreviewMode: "页面预览模式",
  themePreviewApply: "在页面预览",
  themePreviewCancel: "停止预览",
  themePreviewHint:
    "预览是临时的。按 Escape 可恢复原本外观，不会保存任何更改。",
  personalAppearance: "个人外观",
  personalAppearanceHint:
    "仅影响此浏览器。个人风格会替代站点的颜色与 CSS；深浅模式保持独立。",
  personalSave: "在此浏览器使用",
  personalSaved: "个人外观已保存。",
  useSiteAppearance: "使用站点外观",
  siteAppearanceHint:
    "未选择个人风格的浏览器会使用此共享默认设置。高级 CSS 是公开内容，并会包含于备份。",
};

export const themeJa: ThemeMessages = {
  themeStyles: "テーマのスタイル",
  themeStylesHint:
    "スタイルを選択します。明暗モード、密度、ガラス効果は個別に設定できます。",
  themeFutureGlass: "フューチャーグラス",
  themeGraphite: "グラファイト",
  themeTide: "潮流",
  themeForest: "森林",
  themeDune: "砂丘",
  futureGlassHint: "半透明のコンソールと分類カード",
  graphiteHint: "灰色のコンパクトな一覧と横並びの行",
  tideHint: "青緑のセクションと横の見出し",
  forestHint: "緑の棚とコンパクトなサービス行",
  duneHint: "暖色の中央揃えギャラリーと大きなアイコン",
  customTheme: "カスタムテーマ",
  customizeTheme: "コピーをカスタマイズ",
  themeCopyName: "{name} のコピー",
  themeBackground: "背景",
  themeSurface: "表面",
  themeRadius: "角の丸み",
  themeShadow: "影",
  shadowNone: "なし",
  shadowSoft: "柔らかい影",
  themeTokensHint:
    "明暗両方の背景、表面、アクセントを設定します。文字、コントロール、フォーカスの色は自動調整されます。",
  invalidTheme:
    "テーマ形式 1、1–80 文字の名前、十六進カラー、読みやすい文字色を共有できる背景と表面（4.5:1）を使用してください。",
  themeLibrary: "保存したテーマ",
  themeLibraryHint:
    "このブラウザーに最大 10 個の配色テーマを保存できます。CSS は別に保存されます。",
  themeSaveLibrary: "このブラウザーのライブラリに保存",
  themeUpdateLibrary: "保存したテーマを更新",
  themeLibraryFull:
    "テーマがすでに 10 個あります。追加する前に削除してください。",
  themeStorageError:
    "ブラウザーの保存領域が利用できないか満杯です。下書きは保持されています。保存を許可して再試行してください。",
  themeLibrarySaved: "このブラウザーにテーマを保存しました。",
  useSavedTheme: "{name} を使用",
  deleteSavedTheme: "{name} を削除",
  deleteThemeTitle: "保存したテーマを削除しますか？",
  deleteThemeHint:
    "このブラウザーのコピーのみ削除します。現在の外観とサイト設定は変わりません。",
  importTheme: "テーマ JSON をインポート",
  importThemeHint:
    "UTF-8 の配色 JSON、上限 16 KiB。CSS や未知のフィールドは使用できません。",
  confirmThemeImport: "インポートしたテーマを使用",
  invalidThemeFile:
    "有効な UTF-8 テーマ JSON を選択してください。上限 16 KiB、重複や未知のフィールドは使用できません。",
  exportTheme: "テーマ JSON をエクスポート",
  themeDownload: "テーマのダウンロードを開始しました。",
  advancedCSS: "詳細 CSS",
  cssWarning:
    "CSS は操作項目を隠したりアクセシビリティを損ねる場合があります。信頼できる CSS のみ使用し、機密情報は含めないでください。CSP による JavaScript と外部リソースの制限は維持されます。",
  cssHint:
    "UTF-8 テキスト、上限 64 KiB。セレクターや規則に制限はありません。無効な CSS はブラウザーが無視します。",
  cssInvalid:
    "NUL を含まない有効な UTF-8 CSS を使用してください。上限 64 KiB。",
  importCSS: "CSS ファイルをインポート",
  confirmCSSImport: "インポートした CSS を使用",
  exportCSS: "CSS ファイルをエクスポート",
  safeAppearance: "セーフ外観",
  safeAppearanceHint:
    "操作項目が隠れた場合は /?appearance=safe を開くとカスタムテーマと CSS を無効にできます。ログインは引き続き必要です。",
  safeAppearanceActive:
    "セーフ外観が有効です。このページのセッションではカスタムスタイルを適用しません。",
  leaveSafeAppearance: "セーフ外観を終了",
  themePreviewMode: "ページのプレビューモード",
  themePreviewApply: "ページでプレビュー",
  themePreviewCancel: "プレビューを停止",
  themePreviewHint:
    "プレビューは一時的です。Escape で元の外観に戻ります。変更は保存されません。",
  personalAppearance: "個人の外観",
  personalAppearanceHint:
    "このブラウザーのみに適用します。個人のスタイルはサイトの配色と CSS を置き換えます。明暗モードは独立しています。",
  personalSave: "このブラウザーで使用",
  personalSaved: "個人の外観を保存しました。",
  useSiteAppearance: "サイトの外観を使用",
  siteAppearanceHint:
    "個人のスタイルを選択していないブラウザーに適用する共通設定です。詳細 CSS は公開され、バックアップにも含まれます。",
};

export const themeKo: ThemeMessages = {
  themeStyles: "테마 스타일",
  themeStylesHint:
    "스타일을 선택하세요. 밝기 모드, 밀도, 유리 효과는 별도로 유지됩니다.",
  themeFutureGlass: "퓨처 글라스",
  themeGraphite: "그래파이트",
  themeTide: "조수",
  themeForest: "숲",
  themeDune: "모래 언덕",
  futureGlassHint: "반투명 콘솔과 그룹별 카드",
  graphiteHint: "회색의 간결한 목록과 가로형 행",
  tideHint: "청록색 섹션과 측면 제목",
  forestHint: "초록색 선반과 간결한 서비스 행",
  duneHint: "따뜻한 색의 중앙 정렬 갤러리와 큰 아이콘",
  customTheme: "사용자 지정 테마",
  customizeTheme: "사본 사용자 지정",
  themeCopyName: "{name} 사본",
  themeBackground: "배경",
  themeSurface: "표면",
  themeRadius: "모서리 반경",
  themeShadow: "그림자",
  shadowNone: "없음",
  shadowSoft: "부드럽게",
  themeTokensHint:
    "밝은 버전과 어두운 버전의 배경, 표면, 강조색을 선택하세요. 텍스트, 컨트롤, 초점 색상은 자동으로 계산됩니다.",
  invalidTheme:
    "테마 형식 1, 1–80자 이름, 십육진수 색상과 읽기 쉬운 텍스트 색상을 공유하는 배경 및 표면(4.5:1)을 사용하세요.",
  themeLibrary: "저장된 테마",
  themeLibraryHint:
    "이 브라우저에만 색상 테마를 최대 10개 저장합니다. CSS는 별도로 저장합니다.",
  themeSaveLibrary: "이 브라우저의 라이브러리에 저장",
  themeUpdateLibrary: "저장된 테마 업데이트",
  themeLibraryFull:
    "이 브라우저에 테마가 이미 10개 있습니다. 먼저 하나를 삭제하세요.",
  themeStorageError:
    "브라우저 저장 공간을 사용할 수 없거나 가득 찼습니다. 초안은 유지됩니다. 저장을 허용한 후 다시 시도하세요.",
  themeLibrarySaved: "이 브라우저에 테마를 저장했습니다.",
  useSavedTheme: "{name} 사용",
  deleteSavedTheme: "{name} 삭제",
  deleteThemeTitle: "저장된 테마를 삭제할까요?",
  deleteThemeHint:
    "이 브라우저의 사본만 삭제합니다. 현재 외관과 사이트 설정은 변경되지 않습니다.",
  importTheme: "테마 JSON 가져오기",
  importThemeHint:
    "UTF-8 색상 JSON, 최대 16 KiB. CSS나 알 수 없는 필드는 허용되지 않습니다.",
  confirmThemeImport: "가져온 테마 사용",
  invalidThemeFile:
    "유효한 UTF-8 테마 JSON 파일을 선택하세요. 최대 16 KiB이며 중복되거나 알 수 없는 필드는 허용되지 않습니다.",
  exportTheme: "테마 JSON 내보내기",
  themeDownload: "테마 다운로드를 시작했습니다.",
  advancedCSS: "고급 CSS",
  cssWarning:
    "CSS는 컨트롤을 숨기거나 접근성을 해칠 수 있습니다. 신뢰할 수 있는 CSS만 사용하고 비밀 정보를 넣지 마세요. CSP는 JavaScript와 외부 리소스를 계속 차단합니다.",
  cssHint:
    "UTF-8 텍스트, 최대 64 KiB. 선택자와 규칙에는 제한이 없으며 잘못된 CSS는 브라우저가 무시합니다.",
  cssInvalid: "NUL이 없는 유효한 UTF-8 CSS를 사용하세요. 최대 64 KiB입니다.",
  importCSS: "CSS 파일 가져오기",
  confirmCSSImport: "가져온 CSS 사용",
  exportCSS: "CSS 파일 내보내기",
  safeAppearance: "안전한 외관",
  safeAppearanceHint:
    "스타일이 컨트롤을 숨기면 /?appearance=safe를 열어 사용자 지정 테마와 CSS를 끄세요. 로그인은 여전히 필요합니다.",
  safeAppearanceActive:
    "안전한 외관이 활성화되었습니다. 이 페이지 세션에서는 사용자 지정 스타일이 적용되지 않습니다.",
  leaveSafeAppearance: "안전한 외관 종료",
  themePreviewMode: "페이지 미리 보기 모드",
  themePreviewApply: "페이지에서 미리 보기",
  themePreviewCancel: "미리 보기 중지",
  themePreviewHint:
    "미리 보기는 임시입니다. Escape를 누르면 원래 외관으로 돌아가며 변경 사항은 저장되지 않습니다.",
  personalAppearance: "개인 외관",
  personalAppearanceHint:
    "이 브라우저에만 적용됩니다. 개인 스타일은 사이트의 색상과 CSS를 대체하며 밝기 모드는 별도로 유지됩니다.",
  personalSave: "이 브라우저에서 사용",
  personalSaved: "개인 외관을 저장했습니다.",
  useSiteAppearance: "사이트 외관 사용",
  siteAppearanceHint:
    "개인 스타일을 선택하지 않은 브라우저에 적용되는 공유 기본값입니다. 고급 CSS는 공개되며 백업에 포함됩니다.",
};

export const themeEs: ThemeMessages = {
  themeStyles: "Estilos de tema",
  themeStylesHint:
    "Elige un estilo. El modo claro u oscuro, la densidad y el cristal son independientes.",
  themeFutureGlass: "Cristal futuro",
  themeGraphite: "Grafito",
  themeTide: "Marea",
  themeForest: "Bosque",
  themeDune: "Duna",
  futureGlassHint: "Consola translúcida y tarjetas agrupadas",
  graphiteHint: "Índice gris compacto y filas horizontales",
  tideHint: "Secciones verde azulado con títulos laterales",
  forestHint: "Estantes verdes y filas de servicios compactas",
  duneHint: "Galería cálida centrada e iconos grandes",
  customTheme: "Tema personalizado",
  customizeTheme: "Personalizar una copia",
  themeCopyName: "Copia de {name}",
  themeBackground: "Fondo",
  themeSurface: "Superficie",
  themeRadius: "Radio de las esquinas",
  themeShadow: "Sombra",
  shadowNone: "Ninguna",
  shadowSoft: "Suave",
  themeTokensHint:
    "Elige fondo, superficie y color de acento para ambas variantes. Los colores del texto, los controles y el foco se calculan automáticamente.",
  invalidTheme:
    "Usa el formato de tema 1, un nombre de 1–80 caracteres, colores hexadecimales y superficies que compartan texto legible (4.5:1).",
  themeLibrary: "Temas guardados",
  themeLibraryHint:
    "Hasta 10 temas de colores solo en este navegador. El CSS se guarda por separado.",
  themeSaveLibrary: "Guardar en la biblioteca del navegador",
  themeUpdateLibrary: "Actualizar tema guardado",
  themeLibraryFull:
    "Este navegador ya tiene 10 temas. Elimina uno antes de añadir otro.",
  themeStorageError:
    "El almacenamiento del navegador no está disponible o está lleno. Se conserva el borrador; permite el almacenamiento e inténtalo de nuevo.",
  themeLibrarySaved: "Tema guardado en este navegador.",
  useSavedTheme: "Usar {name}",
  deleteSavedTheme: "Eliminar {name}",
  deleteThemeTitle: "¿Eliminar este tema guardado?",
  deleteThemeHint:
    "Solo se elimina la copia de este navegador. La apariencia activa y los ajustes del sitio no cambian.",
  importTheme: "Importar JSON de tema",
  importThemeHint:
    "JSON de colores UTF-8, hasta 16 KiB; sin CSS ni campos desconocidos.",
  confirmThemeImport: "Usar tema importado",
  invalidThemeFile:
    "Elige un JSON de tema UTF-8 válido, de hasta 16 KiB, sin campos duplicados ni desconocidos.",
  exportTheme: "Exportar JSON de tema",
  themeDownload: "Se inició la descarga del tema.",
  advancedCSS: "CSS avanzado",
  cssWarning:
    "El CSS puede ocultar controles o perjudicar la accesibilidad. Usa solo CSS de confianza; no es secreto. CSP sigue bloqueando JavaScript y recursos externos.",
  cssHint:
    "Texto UTF-8, hasta 64 KiB. No se restringen selectores ni reglas; el navegador ignora el CSS inválido.",
  cssInvalid: "Usa CSS UTF-8 válido sin NUL, de hasta 64 KiB.",
  importCSS: "Importar archivo CSS",
  confirmCSSImport: "Usar CSS importado",
  exportCSS: "Exportar archivo CSS",
  safeAppearance: "Apariencia segura",
  safeAppearanceHint:
    "Si un estilo oculta controles, abre /?appearance=safe para desactivar temas personalizados y CSS. Sigue siendo necesario iniciar sesión.",
  safeAppearanceActive:
    "La apariencia segura está activa. Los estilos personalizados están desactivados durante esta sesión de página.",
  leaveSafeAppearance: "Salir de la apariencia segura",
  themePreviewMode: "Modo de vista previa de página",
  themePreviewApply: "Vista previa en la página",
  themePreviewCancel: "Detener vista previa",
  themePreviewHint:
    "La vista previa es temporal. Pulsa Escape para restaurar la apariencia; nunca guarda cambios.",
  personalAppearance: "Tu apariencia",
  personalAppearanceHint:
    "Solo afecta a este navegador. El estilo personal sustituye los colores y el CSS del sitio; el modo es independiente.",
  personalSave: "Usar en este navegador",
  personalSaved: "Apariencia personal guardada.",
  useSiteAppearance: "Usar apariencia del sitio",
  siteAppearanceHint:
    "Valores compartidos para navegadores sin estilo personal. El CSS avanzado es público y se incluye en las copias de seguridad.",
};

export const themeFr: ThemeMessages = {
  themeStyles: "Styles de thème",
  themeStylesHint:
    "Choisissez un style. Le mode clair ou sombre, la densité et l'effet de verre restent indépendants.",
  themeFutureGlass: "Verre futuriste",
  themeGraphite: "Graphite",
  themeTide: "Marée",
  themeForest: "Forêt",
  themeDune: "Dune",
  futureGlassHint: "Console translucide et cartes regroupées",
  graphiteHint: "Index gris compact et rangées horizontales",
  tideHint: "Sections bleu-vert et titres latéraux",
  forestHint: "Étagères vertes et lignes de services compactes",
  duneHint: "Galerie chaleureuse centrée et grandes icônes",
  customTheme: "Thème personnalisé",
  customizeTheme: "Personnaliser une copie",
  themeCopyName: "Copie de {name}",
  themeBackground: "Arrière-plan",
  themeSurface: "Surface",
  themeRadius: "Arrondi des angles",
  themeShadow: "Ombre",
  shadowNone: "Aucune",
  shadowSoft: "Douce",
  themeTokensHint:
    "Choisissez le fond, la surface et l'accent des deux variantes. Les couleurs du texte, des commandes et du focus sont calculées automatiquement.",
  invalidTheme:
    "Utilisez le format de thème 1, un nom de 1–80 caractères, des couleurs hexadécimales et des surfaces partageant un texte lisible (4.5:1).",
  themeLibrary: "Thèmes enregistrés",
  themeLibraryHint:
    "Jusqu'à 10 thèmes de couleurs dans ce navigateur uniquement. Le CSS est enregistré séparément.",
  themeSaveLibrary: "Enregistrer dans la bibliothèque du navigateur",
  themeUpdateLibrary: "Mettre à jour le thème enregistré",
  themeLibraryFull:
    "Ce navigateur contient déjà 10 thèmes. Supprimez-en un avant d'en ajouter un autre.",
  themeStorageError:
    "Le stockage du navigateur est indisponible ou plein. Le brouillon est conservé ; autorisez le stockage et réessayez.",
  themeLibrarySaved: "Thème enregistré dans ce navigateur.",
  useSavedTheme: "Utiliser {name}",
  deleteSavedTheme: "Supprimer {name}",
  deleteThemeTitle: "Supprimer ce thème enregistré ?",
  deleteThemeHint:
    "Seule la copie de ce navigateur sera supprimée. L'apparence active et les réglages du site ne changent pas.",
  importTheme: "Importer un thème JSON",
  importThemeHint:
    "JSON de couleurs UTF-8, jusqu'à 16 KiB ; sans CSS ni champs inconnus.",
  confirmThemeImport: "Utiliser le thème importé",
  invalidThemeFile:
    "Choisissez un thème JSON UTF-8 valide, de 16 KiB maximum, sans champs répétés ou inconnus.",
  exportTheme: "Exporter le thème JSON",
  themeDownload: "Téléchargement du thème lancé.",
  advancedCSS: "CSS avancé",
  cssWarning:
    "Le CSS peut masquer des commandes ou nuire à l'accessibilité. N'utilisez que du CSS de confiance ; il n'est pas secret. La CSP bloque toujours JavaScript et les ressources externes.",
  cssHint:
    "Texte UTF-8, jusqu'à 64 KiB. Les sélecteurs et règles sont libres ; le navigateur ignore le CSS invalide.",
  cssInvalid: "Utilisez du CSS UTF-8 valide sans NUL, de 64 KiB maximum.",
  importCSS: "Importer un fichier CSS",
  confirmCSSImport: "Utiliser le CSS importé",
  exportCSS: "Exporter le fichier CSS",
  safeAppearance: "Apparence sécurisée",
  safeAppearanceHint:
    "Si un style masque des commandes, ouvrez /?appearance=safe pour désactiver les thèmes personnalisés et le CSS. La connexion reste obligatoire.",
  safeAppearanceActive:
    "L'apparence sécurisée est active. Les styles personnalisés sont désactivés pour cette session de page.",
  leaveSafeAppearance: "Quitter l'apparence sécurisée",
  themePreviewMode: "Mode d'aperçu de la page",
  themePreviewApply: "Aperçu sur la page",
  themePreviewCancel: "Arrêter l'aperçu",
  themePreviewHint:
    "L'aperçu est temporaire. Appuyez sur Escape pour restaurer l'apparence ; aucune modification n'est enregistrée.",
  personalAppearance: "Votre apparence",
  personalAppearanceHint:
    "S'applique uniquement à ce navigateur. Le style personnel remplace les couleurs et le CSS du site ; le mode reste indépendant.",
  personalSave: "Utiliser dans ce navigateur",
  personalSaved: "Apparence personnelle enregistrée.",
  useSiteAppearance: "Utiliser l'apparence du site",
  siteAppearanceHint:
    "Réglages partagés pour les navigateurs sans style personnel. Le CSS avancé est public et inclus dans les sauvegardes.",
};

export const themeDe: ThemeMessages = {
  themeStyles: "Designstile",
  themeStylesHint:
    "Wähle einen Stil. Hell-Dunkel-Modus, Dichte und Glaseffekt bleiben unabhängig.",
  themeFutureGlass: "Future Glass",
  themeGraphite: "Graphit",
  themeTide: "Gezeiten",
  themeForest: "Wald",
  themeDune: "Düne",
  futureGlassHint: "Durchscheinende Konsole und gruppierte Karten",
  graphiteHint: "Graue, kompakte Übersicht mit horizontalen Zeilen",
  tideHint: "Türkisfarbene Bereiche mit seitlichen Überschriften",
  forestHint: "Grüne Regale mit kompakten Dienstzeilen",
  duneHint: "Zentrierte Galerie in warmen Tönen mit großen Symbolen",
  customTheme: "Eigenes Design",
  customizeTheme: "Kopie anpassen",
  themeCopyName: "{name}-Kopie",
  themeBackground: "Hintergrund",
  themeSurface: "Fläche",
  themeRadius: "Eckenradius",
  themeShadow: "Schatten",
  shadowNone: "Keiner",
  shadowSoft: "Weich",
  themeTokensHint:
    "Wähle Hintergrund, Fläche und Akzent für beide Varianten. Text-, Steuerungs- und Fokusfarben werden automatisch berechnet.",
  invalidTheme:
    "Verwende Designformat 1, einen Namen mit 1–80 Zeichen, Hexfarben und Flächen mit gemeinsam lesbarem Text (4.5:1).",
  themeLibrary: "Gespeicherte Designs",
  themeLibraryHint:
    "Bis zu 10 Farbdesigns nur in diesem Browser. CSS wird separat gespeichert.",
  themeSaveLibrary: "In der Browserbibliothek speichern",
  themeUpdateLibrary: "Gespeichertes Design aktualisieren",
  themeLibraryFull:
    "Dieser Browser enthält bereits 10 Designs. Lösche eines, bevor du ein weiteres hinzufügst.",
  themeStorageError:
    "Der Browserspeicher ist nicht verfügbar oder voll. Der Entwurf bleibt erhalten. Erlaube die Speicherung und versuche es erneut.",
  themeLibrarySaved: "Design in diesem Browser gespeichert.",
  useSavedTheme: "{name} verwenden",
  deleteSavedTheme: "{name} löschen",
  deleteThemeTitle: "Dieses gespeicherte Design löschen?",
  deleteThemeHint:
    "Nur die Kopie in diesem Browser wird entfernt. Aktuelles Erscheinungsbild und Website-Einstellungen bleiben unverändert.",
  importTheme: "Design-JSON importieren",
  importThemeHint:
    "UTF-8-Farb-JSON, bis zu 16 KiB; ohne CSS oder unbekannte Felder.",
  confirmThemeImport: "Importiertes Design verwenden",
  invalidThemeFile:
    "Wähle eine gültige UTF-8-Design-JSON-Datei mit höchstens 16 KiB, ohne doppelte oder unbekannte Felder.",
  exportTheme: "Design-JSON exportieren",
  themeDownload: "Design-Download gestartet.",
  advancedCSS: "Erweitertes CSS",
  cssWarning:
    "CSS kann Bedienelemente verbergen oder die Barrierefreiheit beeinträchtigen. Nutze nur vertrauenswürdiges CSS; es ist nicht geheim. CSP blockiert weiterhin JavaScript und externe Ressourcen.",
  cssHint:
    "UTF-8-Text, bis zu 64 KiB. Selektoren und Regeln sind frei; ungültiges CSS wird vom Browser ignoriert.",
  cssInvalid: "Verwende gültiges UTF-8-CSS ohne NUL mit höchstens 64 KiB.",
  importCSS: "CSS-Datei importieren",
  confirmCSSImport: "Importiertes CSS verwenden",
  exportCSS: "CSS-Datei exportieren",
  safeAppearance: "Sicheres Erscheinungsbild",
  safeAppearanceHint:
    "Falls ein Stil Bedienelemente verdeckt, öffne /?appearance=safe, um eigene Designs und CSS zu deaktivieren. Die Anmeldung bleibt erforderlich.",
  safeAppearanceActive:
    "Das sichere Erscheinungsbild ist aktiv. Eigene Stile sind für diese Seitensitzung deaktiviert.",
  leaveSafeAppearance: "Sicheres Erscheinungsbild verlassen",
  themePreviewMode: "Vorschaumodus der Seite",
  themePreviewApply: "Auf der Seite ansehen",
  themePreviewCancel: "Vorschau beenden",
  themePreviewHint:
    "Die Vorschau ist vorübergehend. Escape stellt dein Erscheinungsbild wieder her; Änderungen werden nicht gespeichert.",
  personalAppearance: "Dein Erscheinungsbild",
  personalAppearanceHint:
    "Gilt nur für diesen Browser. Der persönliche Stil ersetzt Farben und CSS der Website; der Modus bleibt unabhängig.",
  personalSave: "In diesem Browser verwenden",
  personalSaved: "Persönliches Erscheinungsbild gespeichert.",
  useSiteAppearance: "Website-Erscheinungsbild verwenden",
  siteAppearanceHint:
    "Gemeinsame Vorgaben für Browser ohne persönlichen Stil. Erweitertes CSS ist öffentlich und in Sicherungen enthalten.",
};

export const themePtBR: ThemeMessages = {
  themeStyles: "Estilos de tema",
  themeStylesHint:
    "Escolha um estilo. O modo claro ou escuro, a densidade e o vidro são independentes.",
  themeFutureGlass: "Vidro futuro",
  themeGraphite: "Grafite",
  themeTide: "Maré",
  themeForest: "Floresta",
  themeDune: "Duna",
  futureGlassHint: "Console translúcido e cartões agrupados",
  graphiteHint: "Índice cinza compacto e linhas horizontais",
  tideHint: "Seções verde-azuladas com títulos laterais",
  forestHint: "Prateleiras verdes e linhas compactas de serviços",
  duneHint: "Galeria centralizada em tons quentes e ícones grandes",
  customTheme: "Tema personalizado",
  customizeTheme: "Personalizar uma cópia",
  themeCopyName: "Cópia de {name}",
  themeBackground: "Fundo",
  themeSurface: "Superfície",
  themeRadius: "Raio dos cantos",
  themeShadow: "Sombra",
  shadowNone: "Nenhuma",
  shadowSoft: "Suave",
  themeTokensHint:
    "Escolha fundo, superfície e destaque para as duas variantes. As cores do texto, dos controles e do foco são calculadas automaticamente.",
  invalidTheme:
    "Use o formato de tema 1, um nome de 1–80 caracteres, cores hexadecimais e superfícies com texto legível em comum (4.5:1).",
  themeLibrary: "Temas salvos",
  themeLibraryHint:
    "Até 10 temas de cores somente neste navegador. O CSS é salvo separadamente.",
  themeSaveLibrary: "Salvar na biblioteca deste navegador",
  themeUpdateLibrary: "Atualizar tema salvo",
  themeLibraryFull:
    "Este navegador já tem 10 temas. Exclua um antes de adicionar outro.",
  themeStorageError:
    "O armazenamento do navegador está indisponível ou cheio. O rascunho foi mantido; permita o armazenamento e tente novamente.",
  themeLibrarySaved: "Tema salvo neste navegador.",
  useSavedTheme: "Usar {name}",
  deleteSavedTheme: "Excluir {name}",
  deleteThemeTitle: "Excluir este tema salvo?",
  deleteThemeHint:
    "Somente a cópia deste navegador será removida. A aparência ativa e as configurações do site não mudam.",
  importTheme: "Importar JSON de tema",
  importThemeHint:
    "JSON de cores UTF-8, até 16 KiB; sem CSS ou campos desconhecidos.",
  confirmThemeImport: "Usar tema importado",
  invalidThemeFile:
    "Escolha um JSON de tema UTF-8 válido, com no máximo 16 KiB, sem campos duplicados ou desconhecidos.",
  exportTheme: "Exportar JSON de tema",
  themeDownload: "Download do tema iniciado.",
  advancedCSS: "CSS avançado",
  cssWarning:
    "O CSS pode ocultar controles ou prejudicar a acessibilidade. Use apenas CSS confiável; ele não é secreto. A CSP continua bloqueando JavaScript e recursos externos.",
  cssHint:
    "Texto UTF-8, até 64 KiB. Seletores e regras são livres; o navegador ignora CSS inválido.",
  cssInvalid: "Use CSS UTF-8 válido sem NUL, com no máximo 64 KiB.",
  importCSS: "Importar arquivo CSS",
  confirmCSSImport: "Usar CSS importado",
  exportCSS: "Exportar arquivo CSS",
  safeAppearance: "Aparência segura",
  safeAppearanceHint:
    "Se um estilo ocultar controles, abra /?appearance=safe para desativar temas personalizados e CSS. Ainda é necessário entrar.",
  safeAppearanceActive:
    "A aparência segura está ativa. Os estilos personalizados estão desativados nesta sessão de página.",
  leaveSafeAppearance: "Sair da aparência segura",
  themePreviewMode: "Modo de prévia da página",
  themePreviewApply: "Visualizar na página",
  themePreviewCancel: "Parar prévia",
  themePreviewHint:
    "A prévia é temporária. Pressione Escape para restaurar a aparência; nenhuma alteração é salva.",
  personalAppearance: "Sua aparência",
  personalAppearanceHint:
    "Aplica-se apenas a este navegador. O estilo pessoal substitui as cores e o CSS do site; o modo é independente.",
  personalSave: "Usar neste navegador",
  personalSaved: "Aparência pessoal salva.",
  useSiteAppearance: "Usar aparência do site",
  siteAppearanceHint:
    "Padrões compartilhados para navegadores sem estilo pessoal. O CSS avançado é público e incluído nos backups.",
};

export const themeRu: ThemeMessages = {
  themeStyles: "Стили оформления",
  themeStylesHint:
    "Выберите стиль. Светлый или тёмный режим, плотность и эффект стекла настраиваются отдельно.",
  themeFutureGlass: "Стекло будущего",
  themeGraphite: "Графит",
  themeTide: "Прилив",
  themeForest: "Лес",
  themeDune: "Дюна",
  futureGlassHint: "Полупрозрачная панель и сгруппированные карточки",
  graphiteHint: "Компактный серый список с горизонтальными строками",
  tideHint: "Бирюзовые разделы с боковыми заголовками",
  forestHint: "Зелёные полки и компактные строки сервисов",
  duneHint: "Тёплая галерея по центру с крупными значками",
  customTheme: "Своя тема",
  customizeTheme: "Настроить копию",
  themeCopyName: "Копия «{name}»",
  themeBackground: "Фон",
  themeSurface: "Поверхность",
  themeRadius: "Радиус углов",
  themeShadow: "Тень",
  shadowNone: "Нет",
  shadowSoft: "Мягкая",
  themeTokensHint:
    "Выберите фон, поверхность и акцент для обеих версий. Цвета текста, элементов управления и фокуса вычисляются автоматически.",
  invalidTheme:
    "Используйте формат темы 1, имя из 1–80 символов, шестнадцатеричные цвета и поверхности с общим читаемым текстом (4.5:1).",
  themeLibrary: "Сохранённые темы",
  themeLibraryHint:
    "До 10 цветовых тем только в этом браузере. CSS хранится отдельно.",
  themeSaveLibrary: "Сохранить в библиотеку браузера",
  themeUpdateLibrary: "Обновить сохранённую тему",
  themeLibraryFull:
    "В этом браузере уже 10 тем. Удалите одну, прежде чем добавлять новую.",
  themeStorageError:
    "Хранилище браузера недоступно или заполнено. Черновик сохранён; разрешите хранение и повторите попытку.",
  themeLibrarySaved: "Тема сохранена в этом браузере.",
  useSavedTheme: "Использовать {name}",
  deleteSavedTheme: "Удалить {name}",
  deleteThemeTitle: "Удалить сохранённую тему?",
  deleteThemeHint:
    "Будет удалена только копия в этом браузере. Текущее оформление и настройки сайта не изменятся.",
  importTheme: "Импортировать JSON темы",
  importThemeHint:
    "Цветовой JSON в UTF-8, до 16 KiB; без CSS и неизвестных полей.",
  confirmThemeImport: "Использовать импортированную тему",
  invalidThemeFile:
    "Выберите корректный JSON темы в UTF-8 размером до 16 KiB без повторяющихся и неизвестных полей.",
  exportTheme: "Экспортировать JSON темы",
  themeDownload: "Загрузка темы началась.",
  advancedCSS: "Расширенный CSS",
  cssWarning:
    "CSS может скрыть элементы управления или нарушить доступность. Используйте только доверенный CSS и не храните в нём секреты. CSP по-прежнему блокирует JavaScript и внешние ресурсы.",
  cssHint:
    "Текст UTF-8, до 64 KiB. Селекторы и правила не ограничены; браузер игнорирует некорректный CSS.",
  cssInvalid: "Используйте корректный CSS в UTF-8 без NUL размером до 64 KiB.",
  importCSS: "Импортировать файл CSS",
  confirmCSSImport: "Использовать импортированный CSS",
  exportCSS: "Экспортировать файл CSS",
  safeAppearance: "Безопасное оформление",
  safeAppearanceHint:
    "Если стиль скрывает элементы управления, откройте /?appearance=safe для отключения своих тем и CSS. Вход по-прежнему необходим.",
  safeAppearanceActive:
    "Включено безопасное оформление. Свои стили отключены на время этого сеанса страницы.",
  leaveSafeAppearance: "Выйти из безопасного оформления",
  themePreviewMode: "Режим предпросмотра страницы",
  themePreviewApply: "Предпросмотр на странице",
  themePreviewCancel: "Остановить предпросмотр",
  themePreviewHint:
    "Предпросмотр временный. Нажмите Escape для возврата оформления; изменения не сохраняются.",
  personalAppearance: "Ваше оформление",
  personalAppearanceHint:
    "Применяется только в этом браузере. Личный стиль заменяет цвета и CSS сайта; режим не зависит от стиля.",
  personalSave: "Использовать в этом браузере",
  personalSaved: "Личное оформление сохранено.",
  useSiteAppearance: "Использовать оформление сайта",
  siteAppearanceHint:
    "Общие настройки для браузеров без личного стиля. Расширенный CSS общедоступен и входит в резервные копии.",
};

// Keep technical literals, ratios and ranges isolated in right-to-left prose.
export const themeAr: ThemeMessages = {
  themeStyles: "أنماط السمات",
  themeStylesHint:
    "اختر نمطًا. يظل وضع الإضاءة والكثافة والتأثير الزجاجي مستقلًا.",
  themeFutureGlass: "زجاج المستقبل",
  themeGraphite: "الغرافيت",
  themeTide: "المدّ",
  themeForest: "الغابة",
  themeDune: "الكثبان",
  futureGlassHint: "لوحة شبه شفافة وبطاقات مجمّعة",
  graphiteHint: "فهرس رمادي مضغوط وصفوف أفقية",
  tideHint: "أقسام فيروزية بعناوين جانبية",
  forestHint: "رفوف خضراء وصفوف خدمات مضغوطة",
  duneHint: "معرض دافئ في المنتصف وأيقونات كبيرة",
  customTheme: "سمة مخصصة",
  customizeTheme: "تخصيص نسخة",
  themeCopyName: "نسخة من {name}",
  themeBackground: "الخلفية",
  themeSurface: "السطح",
  themeRadius: "استدارة الزوايا",
  themeShadow: "الظل",
  shadowNone: "بلا ظل",
  shadowSoft: "ناعم",
  themeTokensHint:
    "اختر الخلفية والسطح ولون التمييز لكلا الوضعين. تُشتق ألوان النص وعناصر التحكم والتركيز تلقائيًا.",
  invalidTheme:
    "استخدم تنسيق السمة 1 واسمًا بطول \u{2066}1–80\u{2069} حرفًا وألوانًا سداسية وأسطحًا تشترك في نص مقروء بنسبة \u{2066}4.5:1\u{2069}.",
  themeLibrary: "السمات المحفوظة",
  themeLibraryHint:
    "حتى 10 سمات ألوان في هذا المتصفح فقط. يُحفظ CSS بشكل منفصل.",
  themeSaveLibrary: "حفظ في مكتبة هذا المتصفح",
  themeUpdateLibrary: "تحديث السمة المحفوظة",
  themeLibraryFull:
    "يحتوي هذا المتصفح على 10 سمات بالفعل. احذف واحدة قبل إضافة أخرى.",
  themeStorageError:
    "تخزين المتصفح غير متاح أو ممتلئ. تبقى المسودة محفوظة؛ اسمح بالتخزين وحاول مجددًا.",
  themeLibrarySaved: "حُفظت السمة في هذا المتصفح.",
  useSavedTheme: "استخدام {name}",
  deleteSavedTheme: "حذف {name}",
  deleteThemeTitle: "حذف هذه السمة المحفوظة؟",
  deleteThemeHint:
    "تُحذف نسخة هذا المتصفح فقط. لا يتغير المظهر الحالي أو إعدادات الموقع.",
  importTheme: "استيراد سمة JSON",
  importThemeHint:
    "ألوان JSON بترميز \u{2066}UTF-8\u{2069}، بحد أقصى \u{2066}16 KiB\u{2069}؛ دون CSS أو حقول غير معروفة.",
  confirmThemeImport: "استخدام السمة المستوردة",
  invalidThemeFile:
    "اختر ملف سمة JSON صالحًا بترميز \u{2066}UTF-8\u{2069} وحجم أقصاه \u{2066}16 KiB\u{2069}، دون حقول مكررة أو غير معروفة.",
  exportTheme: "تصدير سمة JSON",
  themeDownload: "بدأ تنزيل السمة.",
  advancedCSS: "CSS متقدم",
  cssWarning:
    "قد يخفي CSS عناصر التحكم أو يضر بإمكانية الوصول. استخدم CSS موثوقًا فقط ولا تضع فيه أسرارًا. تستمر CSP في حظر JavaScript والموارد الخارجية.",
  cssHint:
    "نص بترميز \u{2066}UTF-8\u{2069}، بحد أقصى \u{2066}64 KiB\u{2069}. المحددات والقواعد غير مقيدة؛ يتجاهل المتصفح CSS غير الصالح.",
  cssInvalid:
    "استخدم CSS صالحًا بترميز \u{2066}UTF-8\u{2069} دون NUL وبحجم أقصاه \u{2066}64 KiB\u{2069}.",
  importCSS: "استيراد ملف CSS",
  confirmCSSImport: "استخدام CSS المستورد",
  exportCSS: "تصدير ملف CSS",
  safeAppearance: "المظهر الآمن",
  safeAppearanceHint:
    "إذا أخفى النمط عناصر التحكم، افتح \u{2066}/?appearance=safe\u{2069} لتعطيل السمات المخصصة وCSS. يظل تسجيل الدخول مطلوبًا.",
  safeAppearanceActive:
    "المظهر الآمن مفعّل. الأنماط المخصصة معطلة طوال جلسة هذه الصفحة.",
  leaveSafeAppearance: "مغادرة المظهر الآمن",
  themePreviewMode: "وضع معاينة الصفحة",
  themePreviewApply: "معاينة على الصفحة",
  themePreviewCancel: "إيقاف المعاينة",
  themePreviewHint:
    "المعاينة مؤقتة. اضغط Escape لاستعادة المظهر؛ لا تُحفظ التغييرات.",
  personalAppearance: "مظهرك",
  personalAppearanceHint:
    "يُطبق على هذا المتصفح فقط. يستبدل النمط الشخصي ألوان الموقع وCSS؛ يظل وضع الإضاءة مستقلًا.",
  personalSave: "استخدام في هذا المتصفح",
  personalSaved: "حُفظ المظهر الشخصي.",
  useSiteAppearance: "استخدام مظهر الموقع",
  siteAppearanceHint:
    "إعدادات مشتركة للمتصفحات التي لا تستخدم نمطًا شخصيًا. CSS المتقدم علني ويُضمّن في النسخ الاحتياطية.",
};

export const themeHi: ThemeMessages = {
  themeStyles: "थीम शैलियाँ",
  themeStylesHint:
    "एक शैली चुनें। हल्का या गहरा मोड, घनत्व और काँच का प्रभाव स्वतंत्र रहते हैं।",
  themeFutureGlass: "भविष्य का काँच",
  themeGraphite: "ग्रेफाइट",
  themeTide: "ज्वार",
  themeForest: "वन",
  themeDune: "रेत के टीले",
  futureGlassHint: "अर्धपारदर्शी कंसोल और समूहित कार्ड",
  graphiteHint: "सघन धूसर सूची और क्षैतिज पंक्तियाँ",
  tideHint: "किनारे पर शीर्षक वाले नीले-हरे अनुभाग",
  forestHint: "हरे शेल्फ़ और सघन सेवा पंक्तियाँ",
  duneHint: "बीच में गर्म रंगों वाली गैलरी और बड़े आइकन",
  customTheme: "कस्टम थीम",
  customizeTheme: "एक कॉपी अनुकूलित करें",
  themeCopyName: "{name} की कॉपी",
  themeBackground: "पृष्ठभूमि",
  themeSurface: "सतह",
  themeRadius: "कोनों की त्रिज्या",
  themeShadow: "छाया",
  shadowNone: "कोई नहीं",
  shadowSoft: "हल्की",
  themeTokensHint:
    "दोनों रूपों के लिए पृष्ठभूमि, सतह और मुख्य रंग चुनें। पाठ, नियंत्रण और फ़ोकस के रंग अपने आप निकाले जाते हैं।",
  invalidTheme:
    "थीम प्रारूप 1, 1–80 अक्षरों का नाम, हेक्स रंग और समान पठनीय पाठ वाली सतहें (4.5:1) उपयोग करें।",
  themeLibrary: "सहेजी गई थीम",
  themeLibraryHint:
    "केवल इस ब्राउज़र में अधिकतम 10 रंग थीम। CSS अलग से सहेजा जाता है।",
  themeSaveLibrary: "इस ब्राउज़र की लाइब्रेरी में सहेजें",
  themeUpdateLibrary: "सहेजी गई थीम अपडेट करें",
  themeLibraryFull:
    "इस ब्राउज़र में पहले से 10 थीम हैं। नई जोड़ने से पहले एक हटाएँ।",
  themeStorageError:
    "ब्राउज़र स्टोरेज उपलब्ध नहीं है या भरा हुआ है। ड्राफ़्ट रखा गया है; स्टोरेज की अनुमति दें और फिर प्रयास करें।",
  themeLibrarySaved: "थीम इस ब्राउज़र में सहेजी गई।",
  useSavedTheme: "{name} उपयोग करें",
  deleteSavedTheme: "{name} हटाएँ",
  deleteThemeTitle: "यह सहेजी गई थीम हटाएँ?",
  deleteThemeHint:
    "केवल इस ब्राउज़र की कॉपी हटेगी। सक्रिय रूप और साइट सेटिंग नहीं बदलेंगे।",
  importTheme: "थीम JSON आयात करें",
  importThemeHint: "UTF-8 रंग JSON, अधिकतम 16 KiB; CSS या अज्ञात फ़ील्ड नहीं।",
  confirmThemeImport: "आयातित थीम उपयोग करें",
  invalidThemeFile:
    "मान्य UTF-8 थीम JSON फ़ाइल चुनें, अधिकतम 16 KiB, बिना दोहराए गए या अज्ञात फ़ील्ड के।",
  exportTheme: "थीम JSON निर्यात करें",
  themeDownload: "थीम डाउनलोड शुरू हुआ।",
  advancedCSS: "उन्नत CSS",
  cssWarning:
    "CSS नियंत्रण छिपा सकता है या सुलभता को नुकसान पहुँचा सकता है। केवल विश्वसनीय CSS उपयोग करें; इसमें गोपनीय जानकारी न रखें। CSP अब भी JavaScript और बाहरी संसाधन रोकता है।",
  cssHint:
    "UTF-8 पाठ, अधिकतम 64 KiB। चयनकर्ता और नियम स्वतंत्र हैं; ब्राउज़र अमान्य CSS को अनदेखा करता है।",
  cssInvalid: "NUL के बिना मान्य UTF-8 CSS उपयोग करें, अधिकतम 64 KiB।",
  importCSS: "CSS फ़ाइल आयात करें",
  confirmCSSImport: "आयातित CSS उपयोग करें",
  exportCSS: "CSS फ़ाइल निर्यात करें",
  safeAppearance: "सुरक्षित रूप",
  safeAppearanceHint:
    "यदि शैली नियंत्रण छिपा दे, तो कस्टम थीम और CSS बंद करने के लिए /?appearance=safe खोलें। साइन इन अब भी आवश्यक है।",
  safeAppearanceActive:
    "सुरक्षित रूप सक्रिय है। इस पृष्ठ सत्र में कस्टम शैलियाँ बंद हैं।",
  leaveSafeAppearance: "सुरक्षित रूप से बाहर निकलें",
  themePreviewMode: "पृष्ठ पूर्वावलोकन मोड",
  themePreviewApply: "पृष्ठ पर पूर्वावलोकन",
  themePreviewCancel: "पूर्वावलोकन रोकें",
  themePreviewHint:
    "पूर्वावलोकन अस्थायी है। मूल रूप वापस पाने के लिए Escape दबाएँ; बदलाव सहेजे नहीं जाते।",
  personalAppearance: "आपका रूप",
  personalAppearanceHint:
    "केवल इस ब्राउज़र पर लागू होता है। निजी शैली साइट के रंगों और CSS को बदलती है; मोड स्वतंत्र रहता है।",
  personalSave: "इस ब्राउज़र में उपयोग करें",
  personalSaved: "निजी रूप सहेजा गया।",
  useSiteAppearance: "साइट का रूप उपयोग करें",
  siteAppearanceHint:
    "निजी शैली न चुनने वाले ब्राउज़र के लिए साझा डिफ़ॉल्ट। उन्नत CSS सार्वजनिक है और बैकअप में शामिल है।",
};
