# Graph Report - controlcenter  (2026-11-16)

## Corpus Check
- 74 files · ~46,346 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 658 nodes · 1548 edges · 24 communities (21 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App.tsx
- compilerOptions
- compilerOptions
- Icons.tsx
- package.json
- devDependencies
- plugins
- HomePage.tsx
- Loomixx Control Center (LCC)
- tsconfig.json
- vite.config.ts
- LCC — Loomixx Control Center · stack & architecture
- tauri.conf.json
- VaultContext.tsx
- crypto.ts
- plugins
- lib.rs
- VaultContext.tsx
- globalSearch.ts
- historyPrefs.ts
- types.ts

## God Nodes (most connected - your core abstractions)
1. `permissions` - 35 edges
2. `react` - 34 edges
3. `useCollection()` - 30 edges
4. `useVault()` - 25 edges
5. `VaultProvider()` - 24 edges
6. `VaultSession` - 21 edges
7. `useToast()` - 19 edges
8. `normalizeClient()` - 18 edges
9. `Project` - 18 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Router()` --calls--> `isTauri()`  [EXTRACTED]
  src/App.tsx → src/vault/runtime.ts
- `AuditCaptureBody()` --calls--> `cloneHistoryCapture()`  [EXTRACTED]
  src/components/AuditCaptureModal.tsx → src/vault/historyPrefs.ts
- `ClientContextMenuProps` --references--> `Client`  [EXTRACTED]
  src/components/ClientContextMenu.tsx → src/vault/types.ts
- `ClientDetailProps` --references--> `Project`  [EXTRACTED]
  src/components/ClientDetail.tsx → src/vault/types.ts
- `ClientDetail()` --calls--> `useToast()`  [EXTRACTED]
  src/components/ClientDetail.tsx → src/components/ToastProvider.tsx

## Import Cycles
- None detected.

## Communities (24 total, 3 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.08
Nodes (45): react, Gate(), IconEdit(), IconPlus(), IconTrash(), belongsToProject(), formatDate(), HomePassport() (+37 more)

### Community 1 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 2 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 3 - "Icons.tsx"
Cohesion: 0.09
Nodes (26): CustomSelectBaseProps, CustomSelectMultiProps, CustomSelectOption, CustomSelectProps, CustomSelectSingleProps, base, IconArchive(), IconBell() (+18 more)

### Community 4 - "package.json"
Cohesion: 0.05
Nodes (42): oxlint, dependencies, react, react-dom, react-router-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs (+34 more)

### Community 6 - "plugins"
Cohesion: 0.08
Nodes (58): ClientContactBody(), ClientContactModal(), ClientContactModalProps, initialPhoneDisplay(), clampMenuPos(), ClientContextMenu(), ClientContextMenuProps, ClientMenuAction (+50 more)

### Community 7 - "HomePage.tsx"
Cohesion: 0.05
Nodes (40): core:default, core:window:allow-current-monitor, core:window:allow-inner-size, core:window:allow-is-fullscreen, core:window:allow-is-maximized, core:window:allow-is-visible, core:window:allow-maximize, core:window:allow-outer-size (+32 more)

### Community 8 - "Loomixx Control Center (LCC)"
Cohesion: 0.21
Nodes (13): fromServer(), MAX, sanitize(), ServerFormBody(), ServerFormModal(), ServerFormModalProps, ServerFormValues, normalizeServerStatus() (+5 more)

### Community 11 - "LCC — Loomixx Control Center · stack & architecture"
Cohesion: 0.06
Nodes (33): Desktop (Tauri), Loomixx Control Center (LCC), Запуск (браузер + local vault в IndexedDB), 10. Дорожная карта, 11. История изменений документа, 1. Продукт, 2.1 Local-first, 2.2 Формат vault (+25 more)

### Community 12 - "tauri.conf.json"
Cohesion: 0.08
Nodes (23): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, icons/icon.png, app, security (+15 more)

### Community 13 - "VaultContext.tsx"
Cohesion: 0.10
Nodes (25): Router(), CheckPhase, formatCheckedAt(), UpdatesPage(), CHANGELOG, ChangelogEntry, formatChangelogDate(), createBrowserFs() (+17 more)

### Community 14 - "crypto.ts"
Cohesion: 0.11
Nodes (36): ClientFormModalProps, IconPin(), clampMenuPos(), ProjectContextMenu(), ProjectContextMenuProps, ProjectMenuAction, statusKindClass(), PROJECT_TABS (+28 more)

### Community 15 - "plugins"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 17 - "lib.rs"
Cohesion: 0.43
Nodes (6): Monitor, Option, fit_window_to_work_area(), resolve_monitor(), run(), WebviewWindow

### Community 19 - "VaultContext.tsx"
Cohesion: 0.07
Nodes (43): entityLabel(), asBufferSource(), b64decode(), b64encode(), createVaultMeta(), decryptBytes(), decryptJson(), deriveKey() (+35 more)

### Community 21 - "globalSearch.ts"
Cohesion: 0.16
Nodes (25): IconSearch(), isHistoryPath(), TopbarSearch(), AppSearchContext, AppSearchProvider(), AppSearchValue, useAppSearch(), useSearchCatalog() (+17 more)

### Community 22 - "historyPrefs.ts"
Cohesion: 0.14
Nodes (32): actionTone(), DiffBlock(), diffKindLabel(), ProjectEventRow(), ProjectEventsPreview(), ProjectHistoryDetail(), ProjectHistoryPanel(), useProjectEvents() (+24 more)

### Community 23 - "types.ts"
Cohesion: 0.08
Nodes (43): AuditCaptureBody(), AuditCaptureModal(), CRUD_COLS, Props, HistorySettingsBlock(), PRESETS, ALL_ON_CRUD, asBool() (+35 more)

## Knowledge Gaps
- **201 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `Icons.tsx`, `plugins`, `Loomixx Control Center (LCC)`, `VaultContext.tsx`, `crypto.ts`, `plugins`, `VaultContext.tsx`, `globalSearch.ts`, `historyPrefs.ts`, `types.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `VaultFs` connect `VaultContext.tsx` to `VaultContext.tsx`, `types.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `plugins` connect `plugins` to `App.tsx`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08391608391608392 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._