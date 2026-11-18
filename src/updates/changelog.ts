/**
 * История релизов LCC. Дополнять при каждом заметном изменении UI/vault/desktop.
 * Источник правды для экрана «Обновление»; stack.md §11 — зеркало для людей.
 */

export type ChangelogEntry = {
  /** Стабильный id (не из пользовательского ввода). */
  id: string
  /** ISO-дата YYYY-MM-DD */
  date: string
  /** Semver, если запись привязана к номеру сборки */
  version?: string
  title: string
  highlights: string[]
}

/** Новые записи — в начало массива. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: '2026-11-17-servers-panel',
    date: '2026-11-17',
    version: '0.2.1',
    title: 'Панель серверов',
    highlights: [
      'Модель: несколько проектов на сервере, снимок хостера без секретов',
      'Оболочка: список, превью, полный экран по вкладкам',
      'Spaceweb: кабинет, паспорт, питание, журнал операций; бэкапы хостера не вызываются',
      'SSH сохраняется один раз. Консоль с курсором внутри, файлы по SFTP, графики только из замеров',
      'Свои бэкапы restic и кнопка «Скопировать на это устройство»',
    ],
  },
  {
    id: '2026-11-17-release-download',
    date: '2026-11-17',
    version: '0.2.1',
    title: 'Скачивание установщика релиза',
    highlights: [
      'Спиннер стрелки и процент внутри',
      'Процент виден в топбаре при уходе со страницы',
      'Установщик не трогает vault',
    ],
  },
  {
    id: '2026-11-17-repo-updates',
    date: '2026-11-17',
    version: '0.2.1',
    title: 'Проверка и обновление из репозитория',
    highlights: [
      'Кнопка «Проверить обновления» сверяет версию с GitHub main',
      'Окно: новая версия, сборка и что нового; после закрытия кнопка становится «Обновить»',
      'При следующем запуске проверка идёт сама, и кнопка снова «Обновить», если релиз новее',
      '«Обновить» в desktop-клоне делает fast-forward origin/main и не затирает локальные правки',
    ],
  },
  {
    id: '2026-11-16-api-github-crud',
    date: '2026-11-16',
    version: '0.2.0',
    title: 'Локальный API, GitHub и рабочий CRUD',
    highlights: [
      'Оркестратор: локальный API 127.0.0.1 (чтение, создание, правка, удаление), bearer в зашифрованном vault, события журнала только на чтение',
      'Оркестратор: привязка проекта к GitHub (owner/repo), токен AES-GCM, вкладка «Деплой» — репозиторий, коммиты и PR',
      'Агент доменов: создание, правка и удаление доменов с привязкой к проекту',
      'Агент документов: карточки с текстом, редактор до 20 000 символов',
      'Агент финансов и SEO: расходы и кампании, канал seo/ads',
      'Агент секретов: ссылки на секреты без хранения значений',
    ],
  },
  {
    id: '2026-11-16-exclusive-overlays',
    date: '2026-11-16',
    version: '0.1.2',
    title: 'Exclusive overlays для выпадающих списков',
    highlights: [
      'Клик вне списка закрывает панель во всех разделах (CustomSelect, поиск, ПКМ)',
      'Открытие нового списка закрывает предыдущий (один активный слой)',
      'Nested dismiss: клик по backdrop при открытом select не закрывает модалку',
    ],
  },
  {
    id: '2026-11-14-updates-page',
    date: '2026-11-14',
    version: '0.1.1',
    title: 'Раздел «Обновление»',
    highlights: [
      'Сайдбар: пункт «Обновление» с иконкой refresh',
      'Экран версии/сборки, интерактивный changelog и заглушка «Проверить обновления»',
      'Окно: clamp к work area при старте (fit_window_to_work_area); visible: false + center',
    ],
  },
  {
    id: '2026-11-13-search-focus',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Поиск открывает объект',
    highlights: [
      'Клик по результату → ?id= + useSearchFocus / highlight на странице раздела',
    ],
  },
  {
    id: '2026-11-13-history-prefs',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Настройки истории',
    highlights: [
      'Purge: час / день / 7 дней / вся / произвольный период',
      'Матрица «Фиксировать в истории» (CRUD + системные события)',
      'historyPrefs.ts, gated audit, purgeHistory',
    ],
  },
  {
    id: '2026-11-13-global-search',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Глобальный поиск',
    highlights: [
      'TopbarSearch + globalSearch.ts; дропдаун с бейджами разделов',
      'Отдельный плейсхолдер на /history; морф лупа ↔ крестик',
    ],
  },
  {
    id: '2026-11-13-windowed',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Окно снова windowed',
    highlights: [
      'Убран auto-fullscreen (Rust + useLaunchFullscreen + UnlockScreen)',
    ],
  },
  {
    id: '2026-11-13-app-icon',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Иконка приложения = slime-mark',
    highlights: [
      'app-icon.svg → tauri icon; favicon.svg; SVG favicon в index.html',
      'Fix Win: build.rs window_icon_path; runtime set_icon; bundle icon.png',
    ],
  },
  {
    id: '2026-11-13-history',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Журнал истории',
    highlights: [
      'Сайдбар перед Настройками; auto-audit на put/remove',
      'HistoryPage + diff; audit.ts; topbar search для истории',
    ],
  },
  {
    id: '2026-11-13-project-tabs-servers',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Вкладки проекта и серверы',
    highlights: [
      'Detail tabs (главная / серверы / …); Secrets вне сайдбара',
      'ServersPanel + ServerFormModal + power stub; serverStatus.ts',
    ],
  },
  {
    id: '2026-11-13-v0.1.1',
    date: '2026-11-13',
    version: '0.1.1',
    title: 'Сборка v0.1.1',
    highlights: [
      'Метка «Сборка» на UnlockScreen',
      'Fullscreen через monitor size / set_fullscreen_on_monitor (fix ширины на Win)',
    ],
  },
  {
    id: '2026-11-13-archive-toast',
    date: '2026-11-13',
    title: 'Архив, toast и скелетоны',
    highlights: [
      'Архив вместо корзины; Delete = purge + confirm',
      'ToastProvider; skeletons; усиленный true-fullscreen (позже откатан)',
    ],
  },
  {
    id: '2026-11-13-projects-crud',
    date: '2026-11-13',
    title: 'Projects CRUD',
    highlights: [
      'Форма создания/редактирования, деталка',
      'ПКМ-меню (edit / pin / trash / status), фильтры-бэйджи',
      'Fullscreen launch; suppress native contextmenu',
    ],
  },
  {
    id: '2026-11-13-vault-tauri',
    date: '2026-11-13',
    title: 'Vault и Tauri 2',
    highlights: [
      'Vault: PBKDF2 + AES-GCM, seed, UnlockScreen',
      'Tauri 2 scaffold (нужны MSVC Build Tools)',
    ],
  },
  {
    id: '2026-11-13-bootstrap',
    date: '2026-11-13',
    title: 'Старт проекта',
    highlights: ['Первый черновик LCC · stack & architecture'],
  },
] as const

export function latestChangelogEntry(): ChangelogEntry {
  return CHANGELOG[0]!
}

export function formatChangelogDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return isoDate
  const [, y, mo, d] = m
  return `${d}.${mo}.${y}`
}
