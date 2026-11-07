// All user-facing copy lives here. Add a key to both `en` and `id` — a missing
// key falls back to the default language (id), then to the raw key so nothing
// renders blank.

export const LANGUAGES = ["id", "en"];
export const DEFAULT_LANGUAGE = "id";
export const LANGUAGE_STORAGE_KEY = "livetemp.language";

const LOCALES = { id: "id-ID", en: "en-US" };

const en = {
  app: {
    name: "LiveTemp",
  },
  tabs: {
    monitoring: "Monitoring",
    control: "Control",
  },
  theme: {
    label: "Dark mode",
    on: "on",
    off: "off",
    switchToLight: "Switches to light mode",
    switchToDark: "Switches to dark mode",
  },
  language: {
    label: "Language",
    indonesian: "Indonesian",
    english: "English",
    switchToEnglish: "Switch to English",
    switchToIndonesian: "Switch to Indonesian",
    current: "Current language: English",
  },
  dataTable: {
    label: "Data table",
    loading: "Loading data",
    noData: "No data yet",
    noDataMessage: "Items will appear here.",
  },
  monitoring: {
    eyebrow: "Live temperature",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    connecting: "Connecting…",
    offline: "Offline",
    chipA11y: "Sensor feed {status}",
    retryFeed: "Retry sensor feed",
    retryFeedHint: "Attempts to reload sensor history",
    temperatureA11y: "Current temperature {value} degrees Celsius{status}",
    threshold: "Threshold {value}°C",
    lastUpdate: "Last update {time}",
    updated: "Updated {rel} · {count} {unit}",
    justNow: "just now",
    secondsAgo: "{s}s ago",
    minutesAgo: "{m}m ago",
    readingOne: "reading",
    readingOther: "readings",
    feedOfflineTitle: "Sensor feed offline",
    feedOfflineA11y: "Sensor feed offline. {error}",
    historyErrorTitle: "Couldn't load history",
    historyErrorA11y: "Couldn't load history. {error}",
    retryHistory: "Retry loading history",
    historyTitle: "Triggered Alarm History",
    columnTimestamp: "Timestamp",
    columnTemp: "Temp °C",
    columnLimit: "Limit °C",
    emptyTitle: "No readings yet",
    emptyMessage: "Triggered readings appear here. Pull to refresh.",
    emptyRangeMessage:
      "No alarms in the last {range}. Pull to refresh, or widen the range.",
    refresh: "Refresh",
    retry: "Retry",
    errorDefault: "Couldn't load history.",
    range15m: "15 min",
    range1h: "1 hour",
    range6h: "6 hours",
    rangeAll: "All",
    rangeA11y: "Show alarms from the last {range}",
    dbOk: "Database ok · {ms} ms",
    dbUnavailable: "Database unavailable",
    backendUnreachable: "Backend unreachable",
    backendChecking: "Checking backend…",
  },
  status: {
    normal: "Normal",
    near: "Near limit",
    over: "Over limit",
  },
  control: {
    title: "Configure Threshold",
    current: "Current: {value}°C",
    currentA11y: "Current threshold {value} degrees",
    saved: "Threshold saved",
    thresholdLabel: "Threshold (°C)",
    thresholdA11y: "Threshold in degrees Celsius, required",
    helper: "Alert when temperature exceeds this value.",
    rangeError: "Enter a number between {min} and {max}.",
    rangeHint: "Number between {min} and {max}",
    noteLabel: "Note",
    notePlaceholder: "Describe why you are changing the threshold",
    noteA11y: "Note, optional",
    noteHint: "Reason for changing the threshold",
    save: "Save Threshold",
    saveA11y: "Save threshold",
    saveHint: "Saves the new temperature threshold",
    errorA11y: "Error: {message}",
    errorDefault: "Couldn't save. Try again.",
    historyErrorDefault: "Couldn't load history. Try again.",
    historyTitle: "Threshold history",
    columnSavedAt: "Saved At",
    columnThreshold: "Threshold °C",
    columnNote: "Note",
    emptyTitle: "No thresholds yet",
    emptyMessage: "Save your first threshold above.",
    appearanceTitle: "Appearance",
    followingSystem: "Following your device setting (currently {mode}).",
    pinned: "Pinned to {mode} mode.",
    prefSystem: "System",
    prefLight: "Light",
    prefDark: "Dark",
    prefA11y: "{name} appearance",
    prefSystemHint: "Follows the device light or dark setting",
    prefExplicitHint: "Always use {name} mode",
    appearanceFootnote:
      "Active: {mode} · you can also tap the switch in the header from any screen.",
    modeDark: "Dark",
    modeLight: "Light",
    modeSystem: "system",
  },
};

const id = {
  app: {
    name: "LiveTemp",
  },
  tabs: {
    monitoring: "Pemantauan",
    control: "Kontrol",
  },
  theme: {
    label: "Mode gelap",
    on: "nyala",
    off: "mati",
    switchToLight: "Beralih ke mode terang",
    switchToDark: "Beralih ke mode gelap",
  },
  language: {
    label: "Bahasa",
    indonesian: "Bahasa Indonesia",
    english: "Bahasa Inggris",
    switchToEnglish: "Ganti ke Bahasa Inggris",
    switchToIndonesian: "Ganti ke Bahasa Indonesia",
    current: "Bahasa saat ini: Bahasa Indonesia",
  },
  dataTable: {
    label: "Tabel data",
    loading: "Memuat data",
    noData: "Belum ada data",
    noDataMessage: "Data akan muncul di sini.",
  },
  monitoring: {
    eyebrow: "Suhu terkini",
    connected: "Terhubung",
    reconnecting: "Menyambung ulang…",
    connecting: "Menyambung…",
    offline: "Terputus",
    chipA11y: "Umpan sensor {status}",
    retryFeed: "Muat ulang umpan sensor",
    retryFeedHint: "Mencoba memuat ulang riwayat sensor",
    temperatureA11y: "Suhu saat ini {value} derajat Celsius{status}",
    threshold: "Ambang batas {value}°C",
    lastUpdate: "Pembaruan terakhir {time}",
    updated: "Diperbarui {rel} · {count} {unit}",
    justNow: "baru saja",
    secondsAgo: "{s} dtk lalu",
    minutesAgo: "{m} mnt lalu",
    readingOne: "pembacaan",
    readingOther: "pembacaan",
    feedOfflineTitle: "Umpan sensor terputus",
    feedOfflineA11y: "Umpan sensor terputus. {error}",
    historyErrorTitle: "Gagal memuat riwayat",
    historyErrorA11y: "Gagal memuat riwayat. {error}",
    retryHistory: "Muat ulang riwayat",
    historyTitle: "Riwayat Alarm Terpicu",
    columnTimestamp: "Waktu",
    columnTemp: "Suhu °C",
    columnLimit: "Batas °C",
    emptyTitle: "Belum ada pembacaan",
    emptyMessage:
      "Pembacaan yang memicu alarm akan muncul di sini. Tarik untuk memuat ulang.",
    emptyRangeMessage:
      "Tidak ada alarm dalam {range} terakhir. Tarik untuk memuat ulang, atau perluas rentang.",
    refresh: "Muat ulang",
    retry: "Coba lagi",
    errorDefault: "Gagal memuat riwayat.",
    range15m: "15 mnt",
    range1h: "1 jam",
    range6h: "6 jam",
    rangeAll: "Semua",
    rangeA11y: "Tampilkan alarm dari {range} terakhir",
    dbOk: "Database ok · {ms} md",
    dbUnavailable: "Database tidak tersedia",
    backendUnreachable: "Backend tidak terjangkau",
    backendChecking: "Memeriksa backend…",
  },
  status: {
    normal: "Normal",
    near: "Mendekati batas",
    over: "Melebihi batas",
  },
  control: {
    title: "Atur Ambang Batas",
    current: "Saat ini: {value}°C",
    currentA11y: "Ambang batas saat ini {value} derajat",
    saved: "Ambang batas tersimpan",
    thresholdLabel: "Ambang Batas (°C)",
    thresholdA11y: "Ambang batas dalam derajat Celsius, wajib diisi",
    helper: "Alarm berbunyi saat suhu melebihi nilai ini.",
    rangeError: "Masukkan angka antara {min} dan {max}.",
    rangeHint: "Angka antara {min} dan {max}",
    noteLabel: "Catatan",
    notePlaceholder: "Jelaskan alasan Anda mengubah ambang batas",
    noteA11y: "Catatan, opsional",
    noteHint: "Alasan mengubah ambang batas",
    save: "Simpan Ambang Batas",
    saveA11y: "Simpan ambang batas",
    saveHint: "Menyimpan ambang suhu yang baru",
    errorA11y: "Kesalahan: {message}",
    errorDefault: "Gagal menyimpan. Coba lagi.",
    historyErrorDefault: "Gagal memuat riwayat. Coba lagi.",
    historyTitle: "Riwayat ambang batas",
    columnSavedAt: "Disimpan",
    columnThreshold: "Ambang °C",
    columnNote: "Catatan",
    emptyTitle: "Belum ada ambang batas",
    emptyMessage: "Simpan ambang batas pertama Anda di atas.",
    appearanceTitle: "Tampilan",
    followingSystem: "Mengikuti setelan perangkat Anda (saat ini {mode}).",
    pinned: "Terpaku ke mode {mode}.",
    prefSystem: "Sistem",
    prefLight: "Terang",
    prefDark: "Gelap",
    prefA11y: "Tampilan {name}",
    prefSystemHint: "Mengikuti setelan terang atau gelap perangkat",
    prefExplicitHint: "Selalu gunakan mode {name}",
    appearanceFootnote:
      "Aktif: {mode} · Anda juga bisa menekan sakelar di header dari layar mana pun.",
    modeDark: "Gelap",
    modeLight: "Terang",
    modeSystem: "sistem",
  },
};

export const translations = { en, id };

export function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : null;
}

export function localeOf(lang) {
  return LOCALES[lang] ?? LOCALES[DEFAULT_LANGUAGE];
}

function lookup(table, key) {
  return key
    .split(".")
    .reduce((node, part) => (node == null ? undefined : node[part]), table);
}

export function translate(lang, key, vars) {
  const table = translations[lang] ?? translations[DEFAULT_LANGUAGE];
  const raw =
    lookup(table, key) ??
    lookup(translations[DEFAULT_LANGUAGE], key) ??
    key;
  if (typeof raw !== "string") return key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

// Decimal separator follows the language: 30.5 → "30,50" (id) / "30.50" (en).
export function formatNumber(value, lang, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const fixed = value.toFixed(digits);
  return lang === "id" ? fixed.replace(".", ",") : fixed;
}

export function formatDateTime(value, lang) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  try {
    return date.toLocaleString(localeOf(lang));
  } catch {
    return date.toLocaleString();
  }
}
