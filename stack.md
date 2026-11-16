# LCC — Loomixx Control Center · stack & architecture

Живой документ. При изменении стека, архитектуры или правил — обновлять этот файл в том же коммите/сессии.

---

## 1. Продукт

**LCC** — desktop-first control center студии Loomixx: единое место для проектов, клиентов, серверов, доменов, документации, SEO/рекламы, финансов и ссылок на секреты.

| Клиент | Статус |
|--------|--------|
| ПК (основной) | Tauri 2 scaffold + React UI; vault работает в браузере (IndexedDB) и на диске (Tauri FS) |
| Android | позже, отдельное приложение к той же модели данных |
| Публичный веб | не цель; `npm run dev` — среда разработки UI + vault в IndexedDB |

Пользователи: владелец + напарник (доступ по проектам).

---

## 2. Архитектурные решения (зафиксировано)

### 2.1 Local-first

- Источник правды — **файлы vault** (отдельные сущности), не облачный сервер.
- Каждый entity-файл шифруется **AES-256-GCM**; ключ из мастер-пароля через **PBKDF2-SHA256** (310k iterations).
- Метаданные KDF: `.lcc/meta.json` (salt, iterations) — без секрета.
- Проверка пароля: `.lcc/probe.enc`.
- Prefs (не секрет): `.lcc/prefs.json`. Флаг `localApi` только включает слушатель, сам bearer там не лежит.
- Секреты интеграций — отдельные AES-GCM файлы, не коллекции и не audit:
  - `.lcc/github.enc` — PAT и логин GitHub
  - `.lcc/api-token.enc` — bearer локального API
- Синхронизация с облаком — **по кнопке** и/или **при выходе** (сейчас пишется `lastSyncAt`; выгрузка в облако — следующий этап).

### 2.2 Формат vault

```
{vaultRoot}/
  .lcc/
    meta.json
    probe.enc
    prefs.json
    github.enc          # PAT, не попадает в API-ответы и audit
    api-token.enc       # bearer локального API
  projects/{id}.json.enc
  clients/{id}.json.enc
  servers/{id}.json.enc
  domains/{id}.json.enc
  docs/{id}.json.enc
  campaigns/{id}.json.enc
  finance/{id}.json.enc
  secrets/{id}.json.enc
  events/{id}.json.enc
```

Бинарный контейнер `.enc`: magic `LCC1` + IV(12) + ciphertext+tag (AES-GCM).

### 2.3 FS adapters

| Runtime | Адаптер | Где лежат данные |
|---------|---------|------------------|
| Браузер / Vite | `browserFs` (IndexedDB) | виртуальные пути |
| Tauri | `tauriFs` (`plugin-fs` + `plugin-dialog`) | `%APPDATA%/…/lcc-vault` или выбранная папка |

### 2.4 Секреты

- В UI — **ссылки и расположение** (`SecretRef`).
- Файлы коллекции `secrets/` тоже AES-GCM.
- Зона `secrets/` недоступна ИИ по умолчанию (`prefs.aiFiles` — флаг на будущее).

### 2.5 ИИ по файлам

- Позже: инструменты `list / search / read / write / patch`.
- Allowlist: docs и метаданные; secrets — только явно.

### 2.6 Совместная работа

- Доступ напарника — **по проектам** (модель ролей ещё не в коде).
- MVP: один мастер-ПК + бэкап/синк; двусторонний sync — отдельный этап.

---

## 3. Стек (факт в репозитории)

| Слой | Сейчас |
|------|--------|
| Язык UI | TypeScript |
| UI | React 19 |
| Сборка | Vite 8 |
| Роутинг | react-router-dom 7 (`BrowserRouter` в браузере, `HashRouter` в Tauri) |
| Стили | `src/index.css` (CSS variables) |
| Шрифт | Outfit |
| Линт | oxlint |
| Vault | `src/vault/*` — Web Crypto + session + React context |
| Desktop | Tauri 2 (`src-tauri/`), plugins: fs, dialog, log |
| Данные | encrypted entity files; seed при создании vault |
| Локальный API | `src/api/*`: JSON CRUD на `127.0.0.1`. Dev — middleware Vite `:5173/v1`. Desktop — `src-tauri/src/local_api.rs` `:47331/v1` |
| GitHub | `src/github/*`: только `https://api.github.com`, PAT в `.lcc/github.enc` |
| Окно | обычное (decorations); размер из `tauri.conf` (1440×900, min 1200×720); **без** auto-fullscreen; при старте clamp к **work area** монитора (панель задач / dock) в `lib.rs` |

### Системные зависимости для `npm run desktop`

- Rust (`rustup`, MSVC toolchain) — установлен
- **Visual Studio 2022 Build Tools** + VCTools + Windows SDK (`link.exe`, `dbghelp.lib`)
- WebView2 (обычно уже есть на Win10/11)
- Если `VsDevCmd` ещё не проставил `LIB`, задать вручную пути к MSVC + `Windows Kits\10\Lib\…\um\x64` и `ucrt\x64`

### Планируется

| Слой | Направление |
|------|-------------|
| Cloud sync | реальная выгрузка зашифрованного снимка (Я.Диск / S3) |
| Индекс | локальный SQLite / FTS по расшифрованным docs |
| Мониторинг | внешний (watchdog / Uptime Kuma / Beszel) |
| Android | отдельный клиент к той же схеме vault |

---

## 4. Структура репозитория

```
controlcenter/
├── stack.md
├── app-icon.svg          # source of truth → `npx tauri icon ./app-icon.svg`
├── package.json          # scripts: dev, build, desktop, desktop:build
├── vite.config.ts        # port 5173, ignore src-tauri
├── src-tauri/            # Tauri 2 (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json   # ru.loomixx.lcc · windowed + work-area fit · bundle.icon
│   ├── icons/            # PNG/ICO/ICNS + Store/Android (из app-icon.svg)
│   ├── capabilities/
│   └── src/lib.rs
├── public/
│   ├── favicon.svg       # browser tab = slime mark
│   └── logo-loomixx.png  # legacy asset (не favicon)
├── src/
│   ├── App.tsx           # Gate + ToastProvider + AppSearch + fullscreen
│   ├── index.css
│   ├── hooks/            # useAppChrome, useAppSearch, useSearchCatalog, useSearchFocus,
│   │                     # exclusiveOverlay (один открытый dropdown/меню)
│   ├── layout/AppLayout.tsx
│   ├── components/       # Logo, SlimeHero, Icons (+ IconRefresh), UnlockScreen,
│   │                     # ConfirmDialog, ProjectFormModal, ProjectDetail,
│   │                     # ProjectContextMenu, ServerFormModal, ServersPanel,
│   │                     # ClientFormModal, ClientDetail, ClientContextMenu,
│   │                     # ClientContactModal, CustomSelect, ProjectHistory,
│   │                     # ToastProvider, Skeleton, TopbarSearch,
│   │                     # HistorySettingsBlock, AuditCaptureModal
│   ├── pages/            # + HistoryPage, UpdatesPage, ClientsPage (CRUD)
│   ├── api/              # vaultApi, HTTP-диспетчер, LocalApiHost, dev-мост
│   ├── github/           # parse slug, проверка токена, клиент api.github.com
│   ├── updates/          # changelog.ts — история релизов для /updates
│   ├── version.ts        # APP_VERSION / APP_BUILD / APP_CHANNEL
│   └── vault/
│       ├── types.ts          # + HistoryPrefs / Client.contacts / Project.clientId
│       ├── clientContacts.ts # каналы, normalize, clipboard helpers
│       ├── contactMasks.ts   # +7 / @ / vk.ru/ маски
│       ├── clientProjects.ts # sync Client↔Project
│       ├── projectStatus.ts  # статусы, бэйджи, archive helpers
│       ├── serverStatus.ts   # Online/Reserve/Offline + kind
│       ├── audit.ts          # diff / summarize / buildAuditEvent
│       ├── historyPrefs.ts   # normalize / shouldCapture / purge filters
│       ├── globalSearch.ts   # каталог + searchCatalog (без events/secrets)
│       ├── crypto.ts
│       ├── browserFs.ts
│       ├── tauriFs.ts
│       ├── createFs.ts
│       ├── session.ts
│       ├── seed.ts
│       ├── VaultContext.tsx  # list / put / remove / purgeHistory (+ gated audit)
│       ├── useCollection.ts
│       └── runtime.ts
└── graphify-out/
```

---

## 5. Маршруты UI

| Путь | Страница | Назначение |
|------|----------|------------|
| `/` | HomePage | дашборд из vault (без «Структура инфраструктуры») |
| `/projects` | ProjectsPage | проекты, создание/редактирование, деталка с вкладками, архив, фильтры, context menu |
| `/servers` | ServersPage | хосты (CRUD + power stub) через `ServersPanel` |
| `/domains` | DomainsPage | домены / DNS / SSL, CRUD + проект |
| `/seo` | SeoPage | кампании, CRUD, канал `seo` / `ads` |
| `/clients` | ClientsPage | клиенты: CRUD, деталка, ПКМ, контакты по каналам |
| `/docs` | DocsPage | документация, CRUD, текст до 20 000 символов |
| `/finance` | FinancePage | расходы, CRUD |
| `/secrets` | SecretsPage | SecretRef (маршрут жив; **пункта в сайдбаре нет** — секреты в вкладке проекта). Только имя и место, без значений |
| `/history` | HistoryPage | журнал изменений + diff; topbar — «Поиск в истории...» |
| `/updates` | UpdatesPage | версия/сборка, changelog (`src/updates/changelog.ts`), кнопка «Проверить обновления» (stub) |
| `/settings` | SettingsPage | путь vault, prefs, GitHub, локальный API, блок «История» (purge + capture), lock, sync mark |

Сайдбар: Главная · Проекты · Серверы · Домены и DNS · SEO · Клиенты · Документация · Финансы · **История** · **Обновление** · Настройки.

До входа: `UnlockScreen` (мастер-пароль; новый vault создаётся при первом вводе).

### Деталка проекта — вкладки

Под topbar (поиск / уведомления / Lock / аккаунт), над «← К списку»:  
`Главная` · `Серверы` · `Домены` · `Секреты` · `Деплой` · `SEO` · `Реклама` · `Документы` · `Финансы` · `История`.

Переключение — локальный state + CSS fade (`project-tab-stage`), без смены URL. Контент scoped по `projectId` / имени проекта. «Деплой» читает привязанный репозиторий GitHub (описание, коммиты, открытые PR).  
На «Главной» блок **События** (превью audit по проекту и связанным сущностям). Вкладка **История** — полный журнал обновлений проекта (`ProjectHistory.tsx`) с diff.

---

## 6. Доменная модель (в коде vault)

Коллекции: `projects`, `clients`, `servers`, `domains`, `docs`, `campaigns`, `finance`, `secrets`, `events`.

Общие поля: `id`, `createdAt`, `updatedAt`, опционально `projectId`, `tags`, `notes`.

### Project (актуально)

| Поле | Смысл |
|------|--------|
| `name`, `stack`, `domain`, `note` | паспорт |
| `client` | отображаемое имя клиента (денормализация) |
| `clientId` | привязка к `Client.id` (nullable) |
| `status` | `Планирование` · `Разработка` · `Тестирование` · `Продакшн` (+ legacy `Удален`) |
| `statusKind` | `amber` / `blue` / `purple` / `green` / `red` (выводится из статуса) |
| `pinned` | закрепление сверху списка |
| `deletedAt` | soft-archive → раздел «Архив» на `/projects` |
| `github` | `{ owner, repo }` или `null`. Токен не в проекте |

Форма проекта: `CustomSelect` клиентов (вместо свободного текста). При сохранении — sync `Client.projectIds`.

Архив: `archiveProject` / `unarchiveProject` без confirm. Удаление: только `remove` через кастомный confirm. Legacy-статусы (`В проде`, `В работе`, `Удален`) нормализуются в UI через `projectStatus.ts`.

### Client (актуально)

| Поле | Смысл |
|------|--------|
| `id` | стабильный ключ (`cl-…` / seed `milenkih`) |
| `name`, `note` | ФИО + заметка |
| `projectIds` | привязка к `Project.id[]` |
| `projects` | денормализованная сводка имён (для карточки/поиска) |
| `contacts` | `Record<ClientContactChannel, ClientContactItem[]>` |
| `contact`, `channels` | **legacy** — мигрируются через `normalizeClient` |

Каналы: `phone` · `telegram` · `max` · `vk` · `whatsapp` · `email`.  
Позиция: `{ id, value, phone?, label? }`. Маски: телефон `+7-900-000-1111`, TG `@`, VK `vk.ru/` (`contactMasks.ts`).  
Подпись: пресеты «Рабочий»/«Личный» + свой текст (`CustomSelect` allowCustom).  
Если у клиента уже есть телефоны — в полях «Телефон» других каналов можно выбрать из списка или ввести вручную.

UI: `ClientFormModal` (ФИО + multi-select проектов), `ClientDetail`, `ClientContactModal`, `ClientContextMenu`, `CustomSelect`. Синк с проектами: `clientProjects.syncProjectsForClient` / `syncClientsForProject`. Заметка на карточке — 2 строки (`line-clamp`).

Overlays (`src/hooks/exclusiveOverlay.ts` + `useExclusiveOverlay`): один активный слой на всё приложение (`CustomSelect`, `TopbarSearch` panel, `ProjectContextMenu` / `ClientContextMenu`). Открытие нового → dismiss предыдущего. Outside-click / Escape — capture на `window`; клик по голому `.modal-backdrop` глотается (gesture-guard на `pointerdown`+`mousedown`), чтобы nested select не закрывал модалку. Клик внутри `.modal-card` вне панели только закрывает список и даёт событию дойти до следующего триггера/поля.

### Server (актуально)

| Поле | Смысл |
|------|--------|
| `name`, `host`, `specs`, `role` | паспорт хоста |
| `status` | `Online` · `Reserve` · `Offline` (`serverStatus.ts`) |
| `statusKind` | `green` / `amber` / `red` |
| `projectId` | опциональная привязка к проекту |

UI: `ServerFormModal` (create/edit), `ConfirmDialog` на delete, outline-кнопки edit / trash / power|play (power — stub, пишет Offline/online в vault). Общий `ServersPanel` на `/servers` и во вкладке проекта.

### Campaign

| Поле | Смысл |
|------|--------|
| `channel` | `seo` или `ads`. Пусто — запись видна и в SEO, и в «Рекламе» проекта |
| `statusKind` | только `green` / `amber` (задаёт API, не произвольная строка) |

Домены, документы, финансы и секреты правятся через `vaultApi`. У секрета нет поля значения: только `name` и `place`.

### Локальный API

Слушает **только** `127.0.0.1`. Включается в Настройках. Bearer (`lcc_…`) в `.lcc/api-token.enc`, в память — пока vault открыт.

| Метод | Путь | Смысл |
|-------|------|--------|
| GET | `/v1/health` | без bearer, `{ ok, authorized }` |
| GET/POST | `/v1/{collection}` | список / создание |
| GET/PUT/PATCH/DELETE | `/v1/{collection}/{id}` | чтение / замена обязательных полей / правка / удаление |
| GET | `/v1/github/status` | логин, без токена |
| POST/DELETE | `/v1/github/token` | сохранить или стереть PAT (в ответе только логин) |
| GET | `/v1/github/repo\|commits\|pulls` | `owner` и `repo` в query, не в теле с токеном |

`events` — только GET. Поля `value`, `password`, `token`, `secret` в теле сущности отклоняются. Секреты в query запрещены. Лимит тела 64 КБ, 60 запросов / 10 с. Dev: `http://127.0.0.1:5173/v1` (мост в открытое окно). Desktop: `http://127.0.0.1:47331/v1`.

### VaultEvent / audit (коллекция `events`)

| Поле | Смысл |
|------|--------|
| `title`, `when` | человекочитаемая сводка (+ legacy seed) |
| `action` | `create` · `update` · `delete` · `note` |
| `collection`, `entityId`, `entityLabel` | цель изменения |
| `actor`, `actorRole` | кто (из `prefs.profileName` / `role`) |
| `before`, `after` | JSON-снимки для diff (`body` документов редактится в снимке) |
| `changedKeys` | список изменённых ключей |

Автозапись: `VaultContext.put/remove` (кроме самой коллекции `events`) → проверка `historyPrefs.shouldCapture*` по `prefs.history.capture` → `audit.buildAuditEvent` → `session.put('events', …)`. Seed идёт через `session.put` напрямую — без audit-спама. UI: `HistoryPage` (список + панель diff).

Системные note-события (если включены в capture.events): lock / unlock / sync / значимые prefs / purge истории / смена папки vault.

### VaultPrefs.history (настройки журнала)

Хранится в `.lcc/prefs.json` (не секрет). При загрузке — `normalizeVaultPrefs` (deep-merge, старые vault без поля получают дефолт «всё вкл»).

| Поле | Смысл |
|------|--------|
| `history.capture.entities[col].{create,update,delete}` | CRUD-аудит по коллекциям (без `events`) |
| `history.capture.events.*` | системные + семантические: archive/unarchive/pin/status проекта, status сервера, lock/unlock/sync/prefs/purge/folder |

Семантика: `detectSemanticAudit` на update; чистый archive/pin/status гейтится своим флагом; смешанный апдейт (семантика + другие поля) — через `update`, если семантика выкл.

UI (Settings → «История»):
- удаление: пресеты час / день / 7 дней / вся / произвольный период (`datetime-local`) → confirm → `purgeHistory` (батч remove, concurrency 8) → optional note `historyPurge`;
- «Фиксировать в истории» → `AuditCaptureModal` (таблица разделов × C/U/D + таблица событий приложения).

### Глобальный поиск (topbar)

- UI: `TopbarSearch` в `AppLayout`; query — `AppSearchProvider` / `useAppSearch` (cap 200 символов).
- Вне `/history`: плейсхолдер «Поиск по проектам, серверам, документации...»; дропдаун с хитами + бейдж раздела; клик → переход на страницу раздела.
- На `/history`: плейсхолдер «Поиск в истории...»; фильтр списка через `eventMatchesQuery` (без глобального дропдауна).
- Индекс: `globalSearch.searchCatalog` + `useSearchCatalog` — коллекции projects/servers/domains/campaigns/clients/docs/finance. **Не ищет** `events` (история отдельно) и `secrets` (не в индексе).
- Affix: при ≥1 символе лупа плавно морфится в крестик (очистка); при пустой строке — обратно в лупу.
- Клик по хиту → `/{section}?id={entityId}` (`SearchHit.to`); страница читает `useSearchFocus` / `useSearchHighlight`:
  - проекты → деталка (`selectedId`, архив при необходимости);
  - клиенты → деталка (`selectedId`);
  - серверы → форма редактирования;
  - остальные разделы → scroll + подсветка `.entity-focus` (~2.2с).
  `?id=` снимается replace после успеха (без path-сепараторов в id).

### Обновления приложения (`/updates`)

- Данные: `src/version.ts` (`APP_VERSION` ← Vite `__APP_VERSION__` из `package.json`; `APP_BUILD`, `APP_CHANNEL=local`) + `src/updates/changelog.ts` (ручной журнал, дополнять при релизах).
- UI: `UpdatesPage` — карточка версии/сборки/канала/среды; список релизов + детальная панель; кнопка «Проверить обновления» с abortable delay + toast (без сети — cloud sync ещё нет).
- Иконка сайдбара: `IconRefresh`.

Дальше (ещё не файлы): Environments, attachments, Member/ACL.

---

## 7. Дизайн-система (правила UI)

### Бренд

- Логотип: lime blob + тёмный «I» (`LogoMark` в `src/components/Logo.tsx`).
- Акцент: `#c6f53d` / `#9fd412` (+ soft `#d4ff6a` в градиенте слизи).
- Hero: анимация слизи (`SlimeHero`), не фото.
- **Иконка приложения** (Windows/macOS/tray + `public/favicon.svg`): тот же slime-mark, что в UI.
  Источник: корневой `app-icon.svg` (path + radial gradient как у slime). Регенерация набора:
  `npx tauri icon ./app-icon.svg` → `src-tauri/icons/*` (не править PNG вручную).
  Windows: `.ico` вшивается в `.exe` через `tauri-build` (`build.rs` → `window_icon_path` +
  `rerun-if-changed`); в runtime `set_icon(include_image!("icons/128x128.png"))`.
  После смены иконок нужен **полный перезапуск** `npm run desktop` (не hot-reload).
  Если в проводнике/ярлыке старая картинка — кэш Win: удалить ярлык или
  `ie4uinit.exe -show` / перезапуск Explorer.
- Блок «Структура инфраструктуры» — не делать.

### Правила

- Desktop-first, min-width ~1280px; окно **windowed** (рамка ОС), без auto-fullscreen при старте/unlock.
- Старт окна: `visible: false` → `fit_window_to_work_area` (monitor `work_area` / Win `rcWork`) → clamp outer size + центр внутри work area → `show`. Title bar не должен уходить под панель задач (сверху/снизу/сбоку). Min-size временно снижается, если work area меньше conf min.
- Страницы через `.card`, `.page-head`, `.badge-*`, `.table`, `.grid-cards`.
- Шрифт Outfit; без Inter/Roboto/Arial как основного.
- Нативный browser/OS context menu **отключён** глобально; кастомные меню — точечно (ПКМ: карточка проекта, карточка клиента).
- Context menu: staggered «тык-тык»; проекты — Edit / Pin / Archive / Delete / Status; клиенты — Open / Edit / Delete.
- Toasts: `useToast().notify(...)` — снизу, 5с; новый закрывает предыдущий на **30%** высоты (шаг стека = 70% × 52px); hover = больший lift + z-index вверх + pause timer.
- Fullscreen при запуске отключён (раньше: Rust retries + `useLaunchFullscreen` + unlock-жест).
- Loading: skeleton-компоненты (`CardsSkeleton`, `TableSkeleton`, `DashboardSkeleton`, …) вместо «Читаем vault…».
- Новые UI-библиотеки — только с записью сюда.

---

## 8. Правила разработки

1. Меняется стек / vault / границы модулей → обновить `stack.md` в той же сессии.
2. UI тонкий; persistence только через `VaultSession` / `useVault` / `useCollection`.
3. Секреты и реальные ключи не коммитить.
4. Мониторинг/рекламные API — интеграции, не дублировать продукты.
5. После правок кода: `graphify update .`.
6. Коммиты — только по явной просьбе.
7. Ввод форм: trim + length caps; id для `remove` — без path-сепараторов.

---

## 9. Команды

```bash
npm install
npm run dev            # UI + vault в IndexedDB
npm run build
npm run desktop        # tauri dev (нужен MSVC link.exe)
npm run desktop:build  # tauri build
npm run lint
```

---

## 10. Дорожная карта

1. ~~Desktop UI shell~~  
2. ~~Vault + AES-GCM + unlock~~  
3. ~~Tauri scaffold + FS/dialog~~  
4. ~~Projects CRUD + detail + context menu + archive + status filters + fullscreen~~  
5. ~~Toast stack + skeleton loading на страницах~~  
6. ~~Project tabs + Servers CRUD (form/edit/delete/power stub); Secrets убраны из сайдбара~~  
7. ~~История (audit log + diff) в сайдбаре; topbar search → HistoryPage~~  
8. ~~Глобальный поиск (дропдаун + бейджи разделов; история отдельно; лупа↔clear)~~  
9. ~~Настройки истории: purge по периоду + матрица «Фиксировать в истории»~~  
10. ~~Раздел «Обновление»: версия/сборка + changelog + stub проверки~~  
11. ~~Клиенты CRUD + деталка + ПКМ + контакты (phone/tg/MAX/VK/WA/email) + id~~  
12. ~~Маски контактов + CustomSelect + Client↔Project (`clientId` / `projectIds`)~~  
13. Установить MSVC Build Tools → проверить `npm run desktop`  
14. Реальный cloud sync (+ подключить «Проверить обновления»)  
15. ИИ-инструменты по файлам  
16. ~~GitHub read-only на проект (PAT + вкладка «Деплой»)~~ · мониторинг и рекламные API — дальше  
17. Android · реальный power для серверов  
18. ~~Локальный API CRUD~~ (bearer, 127.0.0.1). Облачный sync по-прежнему не выгружает файлы

---

## 11. История изменений документа

| Дата | Что |
|------|-----|
| 2026-11-13 | Первый черновик |
| 2026-11-13 | Vault (PBKDF2+AES-GCM), seed, UnlockScreen, Tauri 2 scaffold; нужна MSVC Build Tools |
| 2026-11-13 | Projects: форма создания/редактирования, деталка, ПКМ-меню (edit/pin/trash/status), корзина, фильтры-бэйджи, fullscreen launch, suppress native contextmenu |
| 2026-11-13 | Архив вместо корзины; Delete = purge+confirm; ToastProvider; skeletons; усиленный true-fullscreen |
| 2026-11-13 | **v0.1.1** — «Сборка» на Unlock; fullscreen через monitor size / set_fullscreen_on_monitor (fix ширины на Win) |
| 2026-11-13 | Project detail tabs (главная/серверы/…); Secrets вне сайдбара; ServersPanel + ServerFormModal + power stub; `serverStatus.ts` |
| 2026-11-13 | История: сайдбар перед Настройками; auto-audit на put/remove; HistoryPage + diff; `audit.ts`; topbar search |
| 2026-11-13 | App icon = зелёный slime-mark (как LogoMark): `app-icon.svg` → `tauri icon`; favicon.svg; index.html → SVG favicon |
| 2026-11-13 | Fix Win icon: `build.rs` rerun-if-changed + window_icon_path; runtime `set_icon`; bundle `icon.png` |
| 2026-11-13 | Окно снова windowed: убран auto-fullscreen (Rust + `useLaunchFullscreen` + UnlockScreen) |
| 2026-11-13 | Глобальный поиск: `TopbarSearch` + `globalSearch.ts`; дропдаун с бейджами; плейсхолдеры global/history; морф лупа↔крестик |
| 2026-11-13 | Настройки → «История»: purge (час/день/7д/вся/период); матрица capture CRUD+system; `historyPrefs.ts`; gated audit + `purgeHistory` |
| 2026-11-13 | Поиск: клик по результату открывает объект (`?id=` + useSearchFocus / highlight) |
| 2026-11-14 | Окно: clamp к work area при старте (`fit_window_to_work_area` в `lib.rs`); `visible: false` + `center` в `tauri.conf` |
| 2026-11-14 | Vite `server.host: 127.0.0.1` — на Win иначе только `::1`, Tauri не коннектится к `localhost:5173` |
| 2026-11-14 | Сайдбар «Обновление» (`/updates`): `IconRefresh`, текущая версия/сборка/канал, интерактивный changelog (`src/updates/changelog.ts`), кнопка «Проверить обновления» — stub до cloud |
| 2026-11-14 | Клиенты: CRUD + деталка + ПКМ; `contacts` по каналам (phone/telegram/max/vk/whatsapp/email); копирование в буфер; `clientContacts.ts`; id на карточке/деталки |
| 2026-11-14 | Клиенты polish: маски +7/@/vk.ru; подписи Рабочий/Личный; TG аккаунт+телефон; CustomSelect; Client↔Project (`clientId`/`projectIds`); ФИО; 2-line note clamp |
| 2026-11-14 | Toast overlap fix (cover 30%); contact modal stable height + embedded select; ServerForm CustomSelect; project Events + History tab |
| 2026-11-16 | CustomSelect: nested dismiss layer (capture outside-click/Escape + stopPropagation) — клик вне модалки/по телу формы закрывает список, не саму форму клиента |
| 2026-11-16 | **v0.1.2** — `exclusiveOverlay`: один открытый dropdown/меню на app; outside-click везде; новый список закрывает предыдущий; changelog |
| 2026-11-16 | **v0.2.0** — локальный API CRUD; GitHub (`owner/repo`, PAT в `.lcc/github.enc`); CRUD доменов, документов, финансов, кампаний и ссылок на секреты. Работа агентов — в «Обновление» |
