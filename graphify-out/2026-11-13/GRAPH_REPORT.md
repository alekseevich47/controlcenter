# Graph Report - controlcenter  (2026-11-13)

## Corpus Check
- 62 files · ~36,661 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 552 nodes · 1188 edges · 23 communities (20 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
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
- VaultContext.tsx
- globalSearch.ts
- historyPrefs.ts
- ServerFormModal.tsx

## God Nodes (most connected - your core abstractions)
1. `permissions` - 35 edges
2. `useCollection()` - 28 edges
3. `useVault()` - 25 edges
4. `VaultProvider()` - 24 edges
5. `react` - 21 edges
6. `VaultSession` - 21 edges
7. `compilerOptions` - 18 edges
8. `VaultFs` - 17 edges
9. `useToast()` - 15 edges
10. `normalizeProjectStatus()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Router()` --calls--> `isTauri()`  [EXTRACTED]
  src/App.tsx → src/vault/runtime.ts
- `AuditCaptureBody()` --calls--> `cloneHistoryCapture()`  [EXTRACTED]
  src/components/AuditCaptureModal.tsx → src/vault/historyPrefs.ts
- `HistorySettingsBlock()` --calls--> `cloneHistoryCapture()`  [EXTRACTED]
  src/components/HistorySettingsBlock.tsx → src/vault/historyPrefs.ts
- `HistorySettingsBlock()` --calls--> `purgePresetLabel()`  [EXTRACTED]
  src/components/HistorySettingsBlock.tsx → src/vault/historyPrefs.ts
- `ProjectContextMenuProps` --references--> `Project`  [EXTRACTED]
  src/components/ProjectContextMenu.tsx → src/vault/types.ts

## Import Cycles
- None detected.

## Communities (23 total, 3 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.08
Nodes (45): Gate(), HistorySettingsBlock(), IconEdit(), IconPlay(), IconPlus(), IconPower(), IconTrash(), belongsToProject() (+37 more)

### Community 1 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 2 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 3 - "Icons.tsx"
Cohesion: 0.12
Nodes (19): ConfirmDialog(), ConfirmDialogProps, base, IconBell(), IconClients(), IconClose(), IconDocs(), IconDomains() (+11 more)

### Community 4 - "package.json"
Cohesion: 0.05
Nodes (42): oxlint, dependencies, react, react-dom, react-router-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs (+34 more)

### Community 6 - "plugins"
Cohesion: 0.09
Nodes (36): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, react, typescript (+28 more)

### Community 7 - "HomePage.tsx"
Cohesion: 0.05
Nodes (40): core:default, core:window:allow-current-monitor, core:window:allow-inner-size, core:window:allow-is-fullscreen, core:window:allow-is-maximized, core:window:allow-is-visible, core:window:allow-maximize, core:window:allow-outer-size (+32 more)

### Community 8 - "Loomixx Control Center (LCC)"
Cohesion: 0.12
Nodes (34): asBufferSource(), b64decode(), b64encode(), createVaultMeta(), decryptBytes(), decryptJson(), deriveKey(), encryptBytes() (+26 more)

### Community 11 - "LCC — Loomixx Control Center · stack & architecture"
Cohesion: 0.06
Nodes (31): Desktop (Tauri), Loomixx Control Center (LCC), Запуск (браузер + local vault в IndexedDB), 10. Дорожная карта, 11. История изменений документа, 1. Продукт, 2.1 Local-first, 2.2 Формат vault (+23 more)

### Community 12 - "tauri.conf.json"
Cohesion: 0.08
Nodes (23): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, icons/icon.png, app, security (+15 more)

### Community 13 - "VaultContext.tsx"
Cohesion: 0.17
Nodes (17): Router(), createBrowserFs(), idbDelete(), idbGet(), idbKeys(), idbSet(), openDb(), td (+9 more)

### Community 14 - "crypto.ts"
Cohesion: 0.11
Nodes (35): IconArchive(), IconChevron(), IconPin(), IconStatus(), clampMenuPos(), ProjectContextMenu(), ProjectContextMenuProps, ProjectMenuAction (+27 more)

### Community 19 - "VaultContext.tsx"
Cohesion: 0.12
Nodes (15): entityLabel(), HistoryPurgeFilter, normalizeVaultPrefs(), shouldCaptureCrud(), shouldCaptureEvent(), VaultSession, Collection, CollectionMap (+7 more)

### Community 21 - "globalSearch.ts"
Cohesion: 0.23
Nodes (19): isHistoryPath(), TopbarSearch(), useSearchCatalog(), emptyCatalog(), hit(), joinHay(), norm(), SEARCH_SECTIONS (+11 more)

### Community 22 - "historyPrefs.ts"
Cohesion: 0.09
Nodes (37): AuditCaptureBody(), AuditCaptureModal(), CRUD_COLS, Props, PRESETS, AuditAction, ALL_ON_CRUD, asBool() (+29 more)

### Community 23 - "ServerFormModal.tsx"
Cohesion: 0.20
Nodes (14): fromServer(), MAX, sanitize(), ServerFormBody(), ServerFormModal(), ServerFormModalProps, ServerFormValues, isServerRunning() (+6 more)

## Knowledge Gaps
- **191 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+186 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `plugins` to `App.tsx`, `Icons.tsx`, `crypto.ts`, `VaultContext.tsx`, `globalSearch.ts`, `historyPrefs.ts`, `ServerFormModal.tsx`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `VaultFs` connect `VaultContext.tsx` to `Loomixx Control Center (LCC)`, `VaultContext.tsx`, `historyPrefs.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _191 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07932692307692307 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Icons.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11692307692307692 - nodes in this community are weakly interconnected._