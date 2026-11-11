export const healthEn = {
  healthTitle: "Health check",
  healthEnable: "Monitor this service",
  healthDescription:
    "When enabled, Nexa Home sends an HTTP GET to this address. Only 2xx responses are available; redirects are not followed.",
  healthUrl: "Health check URL",
  healthUrlHint:
    "Use a trusted address reachable by the server. This URL is private and included in backups.",
  healthInterval: "Check interval (seconds)",
  healthIntervalHint: "30–86400 seconds. Heavy workloads may delay checks.",
  invalidHealthUrl:
    "Enter a valid HTTP(S) URL without credentials or fragments.",
  invalidHealthInterval: "Enter a whole number from 30 to 86400.",
  healthUp: "Available",
  healthDown: "Unavailable",
  healthUnknown: "Status unknown",
  healthLastChecked: "Last checked: {time}",
  healthRestoreWarning:
    "Restored health checks will contact their configured addresses. Restore only trusted backups.",
} as const;

type HealthMessages = Record<keyof typeof healthEn, string>;

export const healthZhHant: HealthMessages = {
  healthTitle: "健康檢查",
  healthEnable: "監控此服務",
  healthDescription:
    "啟用後，Nexa Home 會對指定網址傳送 HTTP GET；只有 2xx 回應視為可用，不會跟隨重新導向。",
  healthUrl: "健康檢查網址",
  healthUrlHint:
    "請使用伺服器可連線的可信任網址。此網址不會公開，但會包含在備份中。",
  healthInterval: "檢查間隔（秒）",
  healthIntervalHint: "30–86400 秒；監控項目繁忙時，檢查可能延後。",
  invalidHealthUrl: "請輸入不含憑證或片段的有效 HTTP(S) 網址。",
  invalidHealthInterval: "請輸入 30 至 86400 的整數。",
  healthUp: "可用",
  healthDown: "無法使用",
  healthUnknown: "狀態未知",
  healthLastChecked: "上次檢查：{time}",
  healthRestoreWarning:
    "還原後，健康檢查會連線至設定的網址。請只還原可信任的備份。",
};

export const healthZhHans: HealthMessages = {
  healthTitle: "健康检查",
  healthEnable: "监控此服务",
  healthDescription:
    "启用后，Nexa Home 会向指定地址发送 HTTP GET；只有 2xx 响应视为可用，不会跟随重定向。",
  healthUrl: "健康检查地址",
  healthUrlHint:
    "请使用服务器可以访问的可信地址。此地址不会公开，但会包含在备份中。",
  healthInterval: "检查间隔（秒）",
  healthIntervalHint: "30–86400 秒；监控任务较多时，检查可能延迟。",
  invalidHealthUrl: "请输入不含凭据或片段的有效 HTTP(S) 地址。",
  invalidHealthInterval: "请输入 30 至 86400 的整数。",
  healthUp: "可用",
  healthDown: "不可用",
  healthUnknown: "状态未知",
  healthLastChecked: "上次检查：{time}",
  healthRestoreWarning:
    "恢复后，健康检查会连接到配置的地址。请只恢复可信的备份。",
};

export const healthJa: HealthMessages = {
  healthTitle: "ヘルスチェック",
  healthEnable: "このサービスを監視",
  healthDescription:
    "有効にすると、Nexa Home は指定先に HTTP GET を送信します。2xx 応答のみを稼働中とし、リダイレクトは追跡しません。",
  healthUrl: "ヘルスチェック URL",
  healthUrlHint:
    "サーバーから到達できる信頼済みのアドレスを指定してください。この URL は非公開ですが、バックアップに含まれます。",
  healthInterval: "チェック間隔（秒）",
  healthIntervalHint:
    "30–86400 秒。監視対象が多い場合、チェックが遅れることがあります。",
  invalidHealthUrl:
    "認証情報とフラグメントを含まない有効な HTTP(S) URL を入力してください。",
  invalidHealthInterval: "30 から 86400 までの整数を入力してください。",
  healthUp: "稼働中",
  healthDown: "利用不可",
  healthUnknown: "状態不明",
  healthLastChecked: "最終確認：{time}",
  healthRestoreWarning:
    "復元されたヘルスチェックは設定先に接続します。信頼できるバックアップのみを復元してください。",
};

export const healthKo: HealthMessages = {
  healthTitle: "상태 확인",
  healthEnable: "이 서비스 모니터링",
  healthDescription:
    "활성화하면 Nexa Home이 지정한 주소로 HTTP GET을 보냅니다. 2xx 응답만 사용 가능으로 표시하며 리디렉션은 따르지 않습니다.",
  healthUrl: "상태 확인 URL",
  healthUrlHint:
    "서버에서 연결할 수 있는 신뢰할 만한 주소를 사용하세요. 이 URL은 공개되지 않지만 백업에는 포함됩니다.",
  healthInterval: "확인 간격(초)",
  healthIntervalHint:
    "30–86400초. 모니터링 작업이 많으면 확인이 지연될 수 있습니다.",
  invalidHealthUrl:
    "인증 정보나 프래그먼트가 없는 유효한 HTTP(S) URL을 입력하세요.",
  invalidHealthInterval: "30부터 86400까지의 정수를 입력하세요.",
  healthUp: "사용 가능",
  healthDown: "사용 불가",
  healthUnknown: "상태 알 수 없음",
  healthLastChecked: "마지막 확인: {time}",
  healthRestoreWarning:
    "복원된 상태 확인은 설정된 주소에 연결합니다. 신뢰할 수 있는 백업만 복원하세요.",
};

export const healthEs: HealthMessages = {
  healthTitle: "Comprobación de estado",
  healthEnable: "Supervisar este servicio",
  healthDescription:
    "Al activarlo, Nexa Home envía una petición HTTP GET a esta dirección. Solo las respuestas 2xx indican disponibilidad; no se siguen redirecciones.",
  healthUrl: "URL de comprobación",
  healthUrlHint:
    "Usa una dirección de confianza accesible desde el servidor. Esta URL es privada y se incluye en las copias de seguridad.",
  healthInterval: "Intervalo de comprobación (segundos)",
  healthIntervalHint:
    "30–86400 segundos. Una carga elevada puede retrasar las comprobaciones.",
  invalidHealthUrl:
    "Introduce una URL HTTP(S) válida sin credenciales ni fragmentos.",
  invalidHealthInterval: "Introduce un número entero entre 30 y 86400.",
  healthUp: "Disponible",
  healthDown: "No disponible",
  healthUnknown: "Estado desconocido",
  healthLastChecked: "Última comprobación: {time}",
  healthRestoreWarning:
    "Las comprobaciones restauradas contactarán con sus direcciones configuradas. Restaura solo copias de confianza.",
};

export const healthFr: HealthMessages = {
  healthTitle: "Contrôle de disponibilité",
  healthEnable: "Surveiller ce service",
  healthDescription:
    "Une fois activé, Nexa Home envoie une requête HTTP GET à cette adresse. Seules les réponses 2xx indiquent une disponibilité ; les redirections ne sont pas suivies.",
  healthUrl: "URL de contrôle",
  healthUrlHint:
    "Utilisez une adresse fiable accessible depuis le serveur. Cette URL est privée et incluse dans les sauvegardes.",
  healthInterval: "Intervalle de contrôle (secondes)",
  healthIntervalHint:
    "30–86400 secondes. Une charge élevée peut retarder les contrôles.",
  invalidHealthUrl:
    "Saisissez une URL HTTP(S) valide sans identifiants ni fragment.",
  invalidHealthInterval: "Saisissez un nombre entier de 30 à 86400.",
  healthUp: "Disponible",
  healthDown: "Indisponible",
  healthUnknown: "État inconnu",
  healthLastChecked: "Dernier contrôle : {time}",
  healthRestoreWarning:
    "Les contrôles restaurés contacteront les adresses configurées. Restaurez uniquement des sauvegardes fiables.",
};

export const healthDe: HealthMessages = {
  healthTitle: "Zustandsprüfung",
  healthEnable: "Diesen Dienst überwachen",
  healthDescription:
    "Wenn aktiviert, sendet Nexa Home eine HTTP-GET-Anfrage an diese Adresse. Nur 2xx-Antworten gelten als verfügbar; Weiterleitungen werden nicht verfolgt.",
  healthUrl: "URL der Zustandsprüfung",
  healthUrlHint:
    "Verwende eine vertrauenswürdige Adresse, die der Server erreichen kann. Diese URL ist privat und in Sicherungen enthalten.",
  healthInterval: "Prüfintervall (Sekunden)",
  healthIntervalHint:
    "30–86400 Sekunden. Bei hoher Auslastung können Prüfungen verzögert werden.",
  invalidHealthUrl:
    "Gib eine gültige HTTP(S)-URL ohne Zugangsdaten oder Fragment ein.",
  invalidHealthInterval: "Gib eine ganze Zahl von 30 bis 86400 ein.",
  healthUp: "Verfügbar",
  healthDown: "Nicht verfügbar",
  healthUnknown: "Status unbekannt",
  healthLastChecked: "Zuletzt geprüft: {time}",
  healthRestoreWarning:
    "Wiederhergestellte Zustandsprüfungen kontaktieren ihre konfigurierten Adressen. Stelle nur vertrauenswürdige Sicherungen wieder her.",
};

export const healthPtBR: HealthMessages = {
  healthTitle: "Verificação de integridade",
  healthEnable: "Monitorar este serviço",
  healthDescription:
    "Quando ativado, o Nexa Home envia uma solicitação HTTP GET para este endereço. Apenas respostas 2xx indicam disponibilidade; redirecionamentos não são seguidos.",
  healthUrl: "URL de verificação",
  healthUrlHint:
    "Use um endereço confiável acessível pelo servidor. Esta URL é privada e incluída nos backups.",
  healthInterval: "Intervalo de verificação (segundos)",
  healthIntervalHint:
    "30–86400 segundos. Uma carga elevada pode atrasar as verificações.",
  invalidHealthUrl:
    "Digite uma URL HTTP(S) válida sem credenciais ou fragmentos.",
  invalidHealthInterval: "Digite um número inteiro entre 30 e 86400.",
  healthUp: "Disponível",
  healthDown: "Indisponível",
  healthUnknown: "Estado desconhecido",
  healthLastChecked: "Última verificação: {time}",
  healthRestoreWarning:
    "As verificações restauradas acessarão os endereços configurados. Restaure apenas backups confiáveis.",
};

export const healthRu: HealthMessages = {
  healthTitle: "Проверка состояния",
  healthEnable: "Отслеживать этот сервис",
  healthDescription:
    "После включения Nexa Home отправляет HTTP GET по указанному адресу. Доступность подтверждают только ответы 2xx; перенаправления не выполняются.",
  healthUrl: "URL проверки состояния",
  healthUrlHint:
    "Укажите доверенный адрес, доступный серверу. Этот URL не публикуется, но включается в резервные копии.",
  healthInterval: "Интервал проверки (секунды)",
  healthIntervalHint:
    "30–86400 секунд. При высокой нагрузке проверки могут задерживаться.",
  invalidHealthUrl:
    "Укажите корректный HTTP(S) URL без учётных данных и фрагмента.",
  invalidHealthInterval: "Введите целое число от 30 до 86400.",
  healthUp: "Доступен",
  healthDown: "Недоступен",
  healthUnknown: "Состояние неизвестно",
  healthLastChecked: "Последняя проверка: {time}",
  healthRestoreWarning:
    "Восстановленные проверки обратятся к настроенным адресам. Восстанавливайте только доверенные резервные копии.",
};

export const healthAr: HealthMessages = {
  healthTitle: "فحص الحالة",
  healthEnable: "مراقبة هذه الخدمة",
  healthDescription:
    "عند التفعيل، يرسل Nexa Home طلب \u{2066}HTTP GET\u{2069} إلى هذا العنوان. تشير استجابات \u{2066}2xx\u{2069} فقط إلى التوفر؛ ولا تُتبع إعادة التوجيه.",
  healthUrl: "عنوان فحص الحالة",
  healthUrlHint:
    "استخدم عنوانًا موثوقًا يمكن للخادم الوصول إليه. هذا العنوان خاص ويُدرج في النسخ الاحتياطية.",
  healthInterval: "الفاصل بين الفحوص (بالثواني)",
  healthIntervalHint:
    "\u{2066}30–86400\u{2069} ثانية. قد تتأخر الفحوص عند ارتفاع الحمل.",
  invalidHealthUrl:
    "أدخل عنوان \u{2066}HTTP(S)\u{2069} صالحًا دون بيانات اعتماد أو جزء مرجعي.",
  invalidHealthInterval:
    "أدخل عددًا صحيحًا من \u{2066}30\u{2069} إلى \u{2066}86400\u{2069}.",
  healthUp: "متاح",
  healthDown: "غير متاح",
  healthUnknown: "الحالة غير معروفة",
  healthLastChecked: "آخر فحص: {time}",
  healthRestoreWarning:
    "ستتصل فحوص الحالة المستعادة بالعناوين المحددة لها. استعد النسخ الاحتياطية الموثوقة فقط.",
};

export const healthHi: HealthMessages = {
  healthTitle: "स्थिति जाँच",
  healthEnable: "इस सेवा की निगरानी करें",
  healthDescription:
    "सक्षम होने पर Nexa Home इस पते पर HTTP GET भेजता है। केवल 2xx प्रतिक्रियाएँ उपलब्ध मानी जाती हैं; रीडायरेक्ट का पालन नहीं किया जाता।",
  healthUrl: "स्थिति जाँच URL",
  healthUrlHint:
    "ऐसा भरोसेमंद पता दें जिसे सर्वर एक्सेस कर सके। यह URL निजी है और बैकअप में शामिल होता है।",
  healthInterval: "जाँच अंतराल (सेकंड)",
  healthIntervalHint:
    "30–86400 सेकंड। अधिक काम होने पर जाँच में देरी हो सकती है।",
  invalidHealthUrl:
    "क्रेडेंशियल या फ़्रैगमेंट के बिना मान्य HTTP(S) URL दर्ज करें।",
  invalidHealthInterval: "30 से 86400 के बीच पूर्ण संख्या दर्ज करें।",
  healthUp: "उपलब्ध",
  healthDown: "अनुपलब्ध",
  healthUnknown: "स्थिति अज्ञात",
  healthLastChecked: "पिछली जाँच: {time}",
  healthRestoreWarning:
    "बहाल की गई स्थिति जाँचें अपने निर्धारित पतों से जुड़ेंगी। केवल भरोसेमंद बैकअप बहाल करें।",
};
