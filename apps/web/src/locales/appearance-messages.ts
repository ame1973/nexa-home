export const appearanceEn = {
  paletteTitle: "Color palette",
  paletteHint: "Colors and layout are selected independently.",
  layoutTitle: "Homepage layout",
  layoutHint: "Choose a layout without changing the colors.",
  layoutGrouped: "Grouped cards",
  layoutIndex: "Compact index",
  layoutSide: "Side headings",
  layoutShelves: "Shelves",
  layoutGallery: "Centered gallery",
  backgroundTitle: "Background image",
  backgroundHint:
    "PNG, JPEG or WebP; up to 4 MiB, 4096 pixels per side and 8,847,360 pixels total.",
  backgroundPersonalHint:
    "This image stays in this browser and is not included in site backups.",
  backgroundSiteHint:
    "The shared image is available to visitors and included in full backups.",
  backgroundChoose: "Choose image",
  backgroundNone: "No background image",
  backgroundUseSite: "Use site background",
  backgroundSelected: "Selected background",
  backgroundSiteActive: "Using site background",
  backgroundNoneActive: "No background selected",
  backgroundInvalid:
    "Choose a valid PNG, JPEG or WebP within the stated limits.",
  backgroundStorageError:
    "The image could not be saved in browser storage. Your draft is kept.",
  backgroundCleanupError:
    "An unused image could not be removed from browser storage. Clear this site's browser data to remove it.",
} as const;

type AppearanceMessages = Record<keyof typeof appearanceEn, string>;

export const appearanceZhHant: AppearanceMessages = {
  paletteTitle: "主題色彩",
  paletteHint: "色彩與版面可分別選擇。",
  layoutTitle: "首頁版面",
  layoutHint: "選擇版面，不會改變色彩。",
  layoutGrouped: "分組卡片",
  layoutIndex: "精簡索引",
  layoutSide: "側邊標題",
  layoutShelves: "分類書架",
  layoutGallery: "置中圖庫",
  backgroundTitle: "背景圖片",
  backgroundHint:
    "PNG、JPEG 或 WebP；最大 4 MiB、每邊 4096 像素、總計 8,847,360 像素。",
  backgroundPersonalHint: "圖片只保留在此瀏覽器，不會包含於站台備份。",
  backgroundSiteHint: "共用圖片會顯示給訪客，並包含於完整備份。",
  backgroundChoose: "選擇圖片",
  backgroundNone: "不使用背景圖片",
  backgroundUseSite: "使用站台背景",
  backgroundSelected: "已選擇背景圖片",
  backgroundSiteActive: "使用站台背景",
  backgroundNoneActive: "尚未選擇背景圖片",
  backgroundInvalid: "請選擇符合限制的 PNG、JPEG 或 WebP 圖片。",
  backgroundStorageError: "無法將圖片儲存至瀏覽器；草稿仍保留。",
  backgroundCleanupError:
    "無法從瀏覽器儲存空間移除不再使用的圖片；請清除此站台的瀏覽器資料以將它移除。",
};
export const appearanceZhHans: AppearanceMessages = {
  paletteTitle: "主题颜色",
  paletteHint: "颜色与布局可以分别选择。",
  layoutTitle: "首页布局",
  layoutHint: "选择布局不会改变颜色。",
  layoutGrouped: "分组卡片",
  layoutIndex: "精简索引",
  layoutSide: "侧边标题",
  layoutShelves: "分类书架",
  layoutGallery: "居中画廊",
  backgroundTitle: "背景图片",
  backgroundHint:
    "PNG、JPEG 或 WebP；最大 4 MiB、每边 4096 像素、总计 8,847,360 像素。",
  backgroundPersonalHint: "图片仅保留在此浏览器，不会包含在站点备份中。",
  backgroundSiteHint: "共享图片对访客可见，并包含在完整备份中。",
  backgroundChoose: "选择图片",
  backgroundNone: "不使用背景图片",
  backgroundUseSite: "使用站点背景",
  backgroundSelected: "已选择背景图片",
  backgroundSiteActive: "使用站点背景",
  backgroundNoneActive: "尚未选择背景图片",
  backgroundInvalid: "请选择符合限制的 PNG、JPEG 或 WebP 图片。",
  backgroundStorageError: "无法将图片保存到浏览器；草稿仍会保留。",
  backgroundCleanupError:
    "无法从浏览器存储中删除不再使用的图片；请清除此站点的浏览器数据以删除它。",
};
export const appearanceJa: AppearanceMessages = {
  paletteTitle: "カラーパレット",
  paletteHint: "色とレイアウトは個別に選択できます。",
  layoutTitle: "ホームのレイアウト",
  layoutHint: "色を変えずにレイアウトを選択します。",
  layoutGrouped: "グループカード",
  layoutIndex: "コンパクトな一覧",
  layoutSide: "横の見出し",
  layoutShelves: "分類棚",
  layoutGallery: "中央揃えのギャラリー",
  backgroundTitle: "背景画像",
  backgroundHint:
    "PNG、JPEG、WebP。最大 4 MiB、各辺 4096 ピクセル、合計 8,847,360 ピクセル。",
  backgroundPersonalHint:
    "画像はこのブラウザーにのみ保存され、サイトのバックアップには含まれません。",
  backgroundSiteHint:
    "共有画像は訪問者に表示され、完全バックアップに含まれます。",
  backgroundChoose: "画像を選択",
  backgroundNone: "背景画像なし",
  backgroundUseSite: "サイトの背景を使用",
  backgroundSelected: "選択した背景画像",
  backgroundSiteActive: "サイトの背景を使用中",
  backgroundNoneActive: "背景画像は未選択",
  backgroundInvalid: "制限内の有効な PNG、JPEG、WebP 画像を選択してください。",
  backgroundStorageError:
    "画像をブラウザーに保存できませんでした。下書きは保持されます。",
  backgroundCleanupError:
    "不要な画像をブラウザーから削除できませんでした。削除するには、このサイトのブラウザーデータを消去してください。",
};
export const appearanceKo: AppearanceMessages = {
  paletteTitle: "색상 팔레트",
  paletteHint: "색상과 레이아웃을 따로 선택합니다.",
  layoutTitle: "홈 레이아웃",
  layoutHint: "색상을 바꾸지 않고 레이아웃을 선택합니다.",
  layoutGrouped: "그룹 카드",
  layoutIndex: "간결한 목록",
  layoutSide: "측면 제목",
  layoutShelves: "분류 선반",
  layoutGallery: "중앙 갤러리",
  backgroundTitle: "배경 이미지",
  backgroundHint:
    "PNG, JPEG 또는 WebP. 최대 4 MiB, 한 변 4096픽셀, 총 8,847,360픽셀.",
  backgroundPersonalHint:
    "이미지는 이 브라우저에만 저장되며 사이트 백업에 포함되지 않습니다.",
  backgroundSiteHint:
    "공유 이미지는 방문자에게 표시되며 전체 백업에 포함됩니다.",
  backgroundChoose: "이미지 선택",
  backgroundNone: "배경 이미지 없음",
  backgroundUseSite: "사이트 배경 사용",
  backgroundSelected: "선택한 배경 이미지",
  backgroundSiteActive: "사이트 배경 사용 중",
  backgroundNoneActive: "선택한 배경 이미지 없음",
  backgroundInvalid: "제한에 맞는 PNG, JPEG 또는 WebP 이미지를 선택하세요.",
  backgroundStorageError:
    "이미지를 브라우저에 저장하지 못했습니다. 초안은 유지됩니다.",
  backgroundCleanupError:
    "사용하지 않는 이미지를 브라우저에서 삭제하지 못했습니다. 삭제하려면 이 사이트의 브라우저 데이터를 지우세요.",
};
export const appearanceEs: AppearanceMessages = {
  paletteTitle: "Paleta de colores",
  paletteHint: "El color y la distribución se eligen por separado.",
  layoutTitle: "Distribución de inicio",
  layoutHint: "Elige la distribución sin cambiar los colores.",
  layoutGrouped: "Tarjetas agrupadas",
  layoutIndex: "Índice compacto",
  layoutSide: "Títulos laterales",
  layoutShelves: "Estantes",
  layoutGallery: "Galería centrada",
  backgroundTitle: "Imagen de fondo",
  backgroundHint:
    "PNG, JPEG o WebP; hasta 4 MiB, 4096 píxeles por lado y 8.847.360 píxeles en total.",
  backgroundPersonalHint:
    "La imagen permanece en este navegador y no se incluye en las copias del sitio.",
  backgroundSiteHint:
    "La imagen compartida es visible para visitantes y se incluye en copias completas.",
  backgroundChoose: "Elegir imagen",
  backgroundNone: "Sin imagen de fondo",
  backgroundUseSite: "Usar fondo del sitio",
  backgroundSelected: "Imagen de fondo seleccionada",
  backgroundSiteActive: "Usando el fondo del sitio",
  backgroundNoneActive: "Ninguna imagen de fondo",
  backgroundInvalid:
    "Elige un PNG, JPEG o WebP válido dentro de los límites indicados.",
  backgroundStorageError:
    "No se pudo guardar la imagen en el navegador. Se conserva el borrador.",
  backgroundCleanupError:
    "No se pudo eliminar una imagen que ya no se usa. Borra los datos de este sitio en el navegador para eliminarla.",
};
export const appearanceFr: AppearanceMessages = {
  paletteTitle: "Palette de couleurs",
  paletteHint: "Les couleurs et la disposition se choisissent séparément.",
  layoutTitle: "Disposition de l’accueil",
  layoutHint: "Choisissez la disposition sans changer les couleurs.",
  layoutGrouped: "Cartes regroupées",
  layoutIndex: "Index compact",
  layoutSide: "Titres latéraux",
  layoutShelves: "Étagères",
  layoutGallery: "Galerie centrée",
  backgroundTitle: "Image de fond",
  backgroundHint:
    "PNG, JPEG ou WebP ; 4 MiB, 4096 pixels par côté et 8 847 360 pixels au total maximum.",
  backgroundPersonalHint:
    "Cette image reste dans ce navigateur et n’est pas incluse dans les sauvegardes du site.",
  backgroundSiteHint:
    "L’image partagée est visible par les visiteurs et incluse dans les sauvegardes complètes.",
  backgroundChoose: "Choisir une image",
  backgroundNone: "Aucune image de fond",
  backgroundUseSite: "Utiliser le fond du site",
  backgroundSelected: "Image de fond sélectionnée",
  backgroundSiteActive: "Fond du site utilisé",
  backgroundNoneActive: "Aucune image de fond sélectionnée",
  backgroundInvalid:
    "Choisissez une image PNG, JPEG ou WebP valide respectant les limites indiquées.",
  backgroundStorageError:
    "Impossible d’enregistrer l’image dans le navigateur. Le brouillon est conservé.",
  backgroundCleanupError:
    "Impossible de supprimer une image inutilisée du navigateur. Effacez les données de ce site pour la supprimer.",
};
export const appearanceDe: AppearanceMessages = {
  paletteTitle: "Farbpalette",
  paletteHint: "Farben und Layout werden unabhängig ausgewählt.",
  layoutTitle: "Startseitenlayout",
  layoutHint: "Wähle ein Layout, ohne die Farben zu ändern.",
  layoutGrouped: "Gruppierte Karten",
  layoutIndex: "Kompakte Übersicht",
  layoutSide: "Seitliche Überschriften",
  layoutShelves: "Regale",
  layoutGallery: "Zentrierte Galerie",
  backgroundTitle: "Hintergrundbild",
  backgroundHint:
    "PNG, JPEG oder WebP; höchstens 4 MiB, 4096 Pixel pro Seite und 8.847.360 Pixel insgesamt.",
  backgroundPersonalHint:
    "Das Bild bleibt in diesem Browser und ist nicht in Site-Backups enthalten.",
  backgroundSiteHint:
    "Das gemeinsame Bild ist für Besucher sichtbar und in vollständigen Backups enthalten.",
  backgroundChoose: "Bild auswählen",
  backgroundNone: "Kein Hintergrundbild",
  backgroundUseSite: "Site-Hintergrund verwenden",
  backgroundSelected: "Ausgewähltes Hintergrundbild",
  backgroundSiteActive: "Site-Hintergrund wird verwendet",
  backgroundNoneActive: "Kein Hintergrundbild ausgewählt",
  backgroundInvalid:
    "Wähle ein gültiges PNG-, JPEG- oder WebP-Bild innerhalb der Grenzen.",
  backgroundStorageError:
    "Das Bild konnte nicht im Browser gespeichert werden. Der Entwurf bleibt erhalten.",
  backgroundCleanupError:
    "Ein nicht mehr verwendetes Bild konnte nicht aus dem Browser gelöscht werden. Lösche die Browserdaten dieser Site, um es zu entfernen.",
};
export const appearancePtBR: AppearanceMessages = {
  paletteTitle: "Paleta de cores",
  paletteHint: "Cores e layout são escolhidos separadamente.",
  layoutTitle: "Layout da página inicial",
  layoutHint: "Escolha o layout sem alterar as cores.",
  layoutGrouped: "Cartões agrupados",
  layoutIndex: "Índice compacto",
  layoutSide: "Títulos laterais",
  layoutShelves: "Prateleiras",
  layoutGallery: "Galeria centralizada",
  backgroundTitle: "Imagem de fundo",
  backgroundHint:
    "PNG, JPEG ou WebP; até 4 MiB, 4096 pixels por lado e 8.847.360 pixels no total.",
  backgroundPersonalHint:
    "A imagem permanece neste navegador e não entra nos backups do site.",
  backgroundSiteHint:
    "A imagem compartilhada é visível aos visitantes e incluída nos backups completos.",
  backgroundChoose: "Escolher imagem",
  backgroundNone: "Sem imagem de fundo",
  backgroundUseSite: "Usar fundo do site",
  backgroundSelected: "Imagem de fundo selecionada",
  backgroundSiteActive: "Usando o fundo do site",
  backgroundNoneActive: "Nenhuma imagem de fundo",
  backgroundInvalid:
    "Escolha um PNG, JPEG ou WebP válido dentro dos limites informados.",
  backgroundStorageError:
    "Não foi possível salvar a imagem no navegador. O rascunho foi mantido.",
  backgroundCleanupError:
    "Não foi possível remover uma imagem não utilizada do navegador. Limpe os dados deste site no navegador para removê-la.",
};
export const appearanceRu: AppearanceMessages = {
  paletteTitle: "Цветовая палитра",
  paletteHint: "Цвета и расположение выбираются независимо.",
  layoutTitle: "Вид главной страницы",
  layoutHint: "Выберите расположение, не меняя цвета.",
  layoutGrouped: "Группы карточек",
  layoutIndex: "Компактный список",
  layoutSide: "Боковые заголовки",
  layoutShelves: "Полки категорий",
  layoutGallery: "Галерея по центру",
  backgroundTitle: "Фоновое изображение",
  backgroundHint:
    "PNG, JPEG или WebP: до 4 МиБ, 4096 пикселей на сторону и 8 847 360 пикселей всего.",
  backgroundPersonalHint:
    "Изображение остаётся в этом браузере и не входит в резервную копию сайта.",
  backgroundSiteHint:
    "Общее изображение видно посетителям и входит в полную резервную копию.",
  backgroundChoose: "Выбрать изображение",
  backgroundNone: "Без фонового изображения",
  backgroundUseSite: "Использовать фон сайта",
  backgroundSelected: "Выбранное фоновое изображение",
  backgroundSiteActive: "Используется фон сайта",
  backgroundNoneActive: "Фоновое изображение не выбрано",
  backgroundInvalid:
    "Выберите допустимый PNG, JPEG или WebP в указанных пределах.",
  backgroundStorageError:
    "Не удалось сохранить изображение в браузере. Черновик сохранён.",
  backgroundCleanupError:
    "Не удалось удалить неиспользуемое изображение из браузера. Чтобы удалить его, очистите данные этого сайта в браузере.",
};
export const appearanceAr: AppearanceMessages = {
  paletteTitle: "لوحة الألوان",
  paletteHint: "يمكن اختيار الألوان والتخطيط كلٌّ على حدة.",
  layoutTitle: "تخطيط الصفحة الرئيسية",
  layoutHint: "اختر التخطيط دون تغيير الألوان.",
  layoutGrouped: "بطاقات مجمّعة",
  layoutIndex: "فهرس مضغوط",
  layoutSide: "عناوين جانبية",
  layoutShelves: "رفوف الفئات",
  layoutGallery: "معرض في المنتصف",
  backgroundTitle: "صورة الخلفية",
  backgroundHint:
    "PNG أو JPEG أو WebP؛ حتى \u{2066}4 MiB\u{2069} و\u{2066}4096\u{2069} بكسل لكل ضلع و\u{2066}8,847,360\u{2069} بكسل إجمالًا.",
  backgroundPersonalHint:
    "تبقى الصورة في هذا المتصفح ولا تدخل في نسخ الموقع الاحتياطية.",
  backgroundSiteHint:
    "تظهر الصورة المشتركة للزوار وتُدرج في النسخ الاحتياطية الكاملة.",
  backgroundChoose: "اختيار صورة",
  backgroundNone: "بلا صورة خلفية",
  backgroundUseSite: "استخدام خلفية الموقع",
  backgroundSelected: "صورة الخلفية المختارة",
  backgroundSiteActive: "خلفية الموقع مستخدمة",
  backgroundNoneActive: "لم تُختر صورة خلفية",
  backgroundInvalid: "اختر صورة PNG أو JPEG أو WebP صالحة ضمن الحدود المذكورة.",
  backgroundStorageError: "تعذر حفظ الصورة في المتصفح. تم الاحتفاظ بالمسودة.",
  backgroundCleanupError:
    "تعذر حذف صورة غير مستخدمة من المتصفح. امسح بيانات هذا الموقع في المتصفح لحذفها.",
};
export const appearanceHi: AppearanceMessages = {
  paletteTitle: "रंग पैलेट",
  paletteHint: "रंग और लेआउट अलग-अलग चुने जाते हैं।",
  layoutTitle: "मुखपृष्ठ लेआउट",
  layoutHint: "रंग बदले बिना लेआउट चुनें।",
  layoutGrouped: "समूहित कार्ड",
  layoutIndex: "सघन सूची",
  layoutSide: "किनारे के शीर्षक",
  layoutShelves: "श्रेणी शेल्फ़",
  layoutGallery: "बीच की गैलरी",
  backgroundTitle: "पृष्ठभूमि चित्र",
  backgroundHint:
    "PNG, JPEG या WebP; अधिकतम 4 MiB, हर ओर 4096 पिक्सेल और कुल 8,847,360 पिक्सेल।",
  backgroundPersonalHint:
    "चित्र केवल इसी ब्राउज़र में रहता है और साइट बैकअप में शामिल नहीं होता।",
  backgroundSiteHint:
    "साझा चित्र आगंतुकों को दिखता है और पूरे बैकअप में शामिल होता है।",
  backgroundChoose: "चित्र चुनें",
  backgroundNone: "कोई पृष्ठभूमि चित्र नहीं",
  backgroundUseSite: "साइट की पृष्ठभूमि उपयोग करें",
  backgroundSelected: "चुना हुआ पृष्ठभूमि चित्र",
  backgroundSiteActive: "साइट की पृष्ठभूमि उपयोग में है",
  backgroundNoneActive: "कोई पृष्ठभूमि चित्र नहीं चुना गया",
  backgroundInvalid: "दी गई सीमा के भीतर मान्य PNG, JPEG या WebP चित्र चुनें।",
  backgroundStorageError:
    "चित्र ब्राउज़र में सहेजा नहीं जा सका। ड्राफ़्ट सुरक्षित है।",
  backgroundCleanupError:
    "अप्रयुक्त चित्र ब्राउज़र से हटाया नहीं जा सका। इसे हटाने के लिए इस साइट का ब्राउज़र डेटा साफ़ करें।",
};
