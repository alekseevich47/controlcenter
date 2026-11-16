import type { AuditAction } from './audit'
import type {
  AuditableCollection,
  Collection,
  CrudCaptureFlags,
  HistoryCapturePrefs,
  HistoryEventFlag,
  HistoryPrefs,
  VaultEvent,
  VaultPrefs,
} from './types'
import { AUDITABLE_COLLECTIONS, DEFAULT_PREFS } from './types'

export type { AuditableCollection, CrudCaptureFlags, HistoryEventFlag, HistoryPrefs }

export const HISTORY_EVENT_META: {
  key: HistoryEventFlag
  label: string
  hint: string
}[] = [
  {
    key: 'vaultLock',
    label: 'Блокировка vault',
    hint: 'Lock / закрытие сессии',
  },
  {
    key: 'vaultUnlock',
    label: 'Разблокировка vault',
    hint: 'Успешный ввод мастер-пароля',
  },
  {
    key: 'vaultSync',
    label: 'Синхронизация',
    hint: 'Отметка синка / бэкапа',
  },
  {
    key: 'prefsChange',
    label: 'Изменение настроек',
    hint: 'Структурные prefs (не каждое нажатие в имени)',
  },
  {
    key: 'historyPurge',
    label: 'Очистка истории',
    hint: 'Удаление записей журнала из настроек',
  },
  {
    key: 'vaultFolderChange',
    label: 'Смена папки vault',
    hint: 'Выбор другого корня хранилища',
  },
  {
    key: 'projectArchive',
    label: 'Архивация проекта',
    hint: 'Перенос в раздел «Архив»',
  },
  {
    key: 'projectUnarchive',
    label: 'Восстановление из архива',
    hint: 'Возврат проекта из архива',
  },
  {
    key: 'projectPin',
    label: 'Закрепление проекта',
    hint: 'Pin / Unpin',
  },
  {
    key: 'projectStatusChange',
    label: 'Смена статуса проекта',
    hint: 'Планирование → … → Продакшн',
  },
  {
    key: 'serverStatusChange',
    label: 'Смена статуса сервера',
    hint: 'Online / Reserve / Offline (вкл. power)',
  },
]

const ALL_ON_CRUD: CrudCaptureFlags = { create: true, update: true, delete: true }

function defaultEntities(): HistoryCapturePrefs['entities'] {
  return {
    projects: { ...ALL_ON_CRUD },
    clients: { ...ALL_ON_CRUD },
    servers: { ...ALL_ON_CRUD },
    domains: { ...ALL_ON_CRUD },
    docs: { ...ALL_ON_CRUD },
    campaigns: { ...ALL_ON_CRUD },
    finance: { ...ALL_ON_CRUD },
    secrets: { ...ALL_ON_CRUD },
  }
}

function defaultEvents(): HistoryCapturePrefs['events'] {
  return { ...DEFAULT_PREFS.history.capture.events }
}

export function defaultHistoryPrefs(): HistoryPrefs {
  return {
    capture: {
      entities: defaultEntities(),
      events: defaultEvents(),
    },
  }
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function normalizeCrud(raw: unknown, fallback: CrudCaptureFlags): CrudCaptureFlags {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    create: asBool(o.create, fallback.create),
    update: asBool(o.update, fallback.update),
    delete: asBool(o.delete, fallback.delete),
  }
}

export function normalizeHistoryPrefs(raw: unknown): HistoryPrefs {
  const base = defaultHistoryPrefs()
  if (!raw || typeof raw !== 'object') return base
  const root = raw as { capture?: unknown }
  const cap = root.capture
  if (!cap || typeof cap !== 'object') return base
  const c = cap as { entities?: unknown; events?: unknown }

  const entities = defaultEntities()
  if (c.entities && typeof c.entities === 'object') {
    const src = c.entities as Record<string, unknown>
    for (const col of AUDITABLE_COLLECTIONS) {
      entities[col] = normalizeCrud(src[col], entities[col])
    }
  }

  const events = defaultEvents()
  if (c.events && typeof c.events === 'object') {
    const src = c.events as Record<string, unknown>
    for (const meta of HISTORY_EVENT_META) {
      events[meta.key] = asBool(src[meta.key], events[meta.key])
    }
  }

  return { capture: { entities, events } }
}

/** Deep-merge prefs при чтении с диска (старые vault без history). */
export function normalizeVaultPrefs(raw: Partial<VaultPrefs> | null | undefined): VaultPrefs {
  return {
    ...DEFAULT_PREFS,
    ...(raw ?? {}),
    localApi: raw?.localApi === true,
    history: normalizeHistoryPrefs(raw?.history ?? DEFAULT_PREFS.history),
  }
}

export type SemanticAuditKind =
  | 'projectArchive'
  | 'projectUnarchive'
  | 'projectPin'
  | 'projectStatusChange'
  | 'serverStatusChange'

export function detectSemanticAudit(
  collection: Collection,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): SemanticAuditKind | null {
  if (!before || !after) return null
  if (collection === 'projects') {
    const bDel = before.deletedAt ?? null
    const aDel = after.deletedAt ?? null
    if (!bDel && aDel) return 'projectArchive'
    if (bDel && !aDel) return 'projectUnarchive'
    if (Boolean(before.pinned) !== Boolean(after.pinned)) return 'projectPin'
    if (before.status !== after.status) return 'projectStatusChange'
  }
  if (collection === 'servers' && before.status !== after.status) {
    return 'serverStatusChange'
  }
  return null
}

const SEMANTIC_KEYS: Record<SemanticAuditKind, string[]> = {
  projectArchive: ['deletedAt'],
  projectUnarchive: ['deletedAt'],
  projectPin: ['pinned'],
  projectStatusChange: ['status', 'statusKind'],
  serverStatusChange: ['status', 'statusKind'],
}

/** true, если отличаются только ключи семантики (+ updatedAt уже вырезан в snapshot). */
export function isOnlySemanticChange(
  semantic: SemanticAuditKind,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): boolean {
  if (!before || !after) return false
  const allowed = new Set(SEMANTIC_KEYS[semantic])
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (allowed.has(key)) continue
    if (stableEq(before[key], after[key])) continue
    return false
  }
  return true
}

function stableEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export function shouldCaptureCrud(
  prefs: VaultPrefs,
  collection: Collection,
  action: Exclude<AuditAction, 'note'>,
): boolean {
  if (collection === 'events') return false
  const capture = prefs.history?.capture
  if (!capture) return true
  const flags = capture.entities[collection as AuditableCollection]
  if (!flags) return true
  return flags[action]
}

/** Проверка update с учётом семантических флагов и смешанных правок. */
export function shouldCaptureUpdate(
  prefs: VaultPrefs,
  collection: Collection,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): boolean {
  const capture = prefs.history?.capture
  if (!capture) return true
  const flags = capture.entities[collection as AuditableCollection]
  const semantic = detectSemanticAudit(collection, before, after)
  if (!semantic) return flags?.update !== false
  if (capture.events[semantic]) return true
  if (isOnlySemanticChange(semantic, before, after)) return false
  return flags?.update !== false
}

export function shouldCaptureEvent(prefs: VaultPrefs, flag: HistoryEventFlag): boolean {
  return prefs.history?.capture?.events?.[flag] !== false
}

/** Ключи prefs, при изменении которых пишем системный audit (не profileName). */
export const SIGNIFICANT_PREFS_KEYS = new Set([
  'syncOnExit',
  'encrypt',
  'aiFiles',
  'role',
  'history',
  'vaultPath',
])

export function prefsPatchIsSignificant(patch: Partial<VaultPrefs>): boolean {
  return Object.keys(patch).some((k) => SIGNIFICANT_PREFS_KEYS.has(k))
}

export type HistoryPurgeFilter =
  | { mode: 'all' }
  | { mode: 'since'; sinceMs: number }
  | { mode: 'range'; fromMs: number; toMs: number }

export type HistoryPurgePreset = 'hour' | 'day' | 'week' | 'all' | 'custom'

export function presetToFilter(
  preset: HistoryPurgePreset,
  customFrom?: string,
  customTo?: string,
  nowMs: number = Date.now(),
): HistoryPurgeFilter | { error: string } {
  if (preset === 'all') return { mode: 'all' }
  if (preset === 'hour') return { mode: 'since', sinceMs: nowMs - 60 * 60 * 1000 }
  if (preset === 'day') return { mode: 'since', sinceMs: nowMs - 24 * 60 * 60 * 1000 }
  if (preset === 'week') return { mode: 'since', sinceMs: nowMs - 7 * 24 * 60 * 60 * 1000 }

  const fromRaw = (customFrom ?? '').trim()
  const toRaw = (customTo ?? '').trim()
  if (!fromRaw || !toRaw) return { error: 'Укажите начало и конец периода' }
  const fromMs = Date.parse(fromRaw)
  const toMs = Date.parse(toRaw)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { error: 'Некорректные даты периода' }
  }
  if (fromMs > toMs) return { error: 'Начало периода позже конца' }
  // datetime-local без секунд — включаем остаток минуты конца
  return { mode: 'range', fromMs, toMs: toMs + 59_999 }
}

export function eventMatchesPurgeFilter(event: VaultEvent, filter: HistoryPurgeFilter): boolean {
  if (filter.mode === 'all') return true
  const iso = event.createdAt || event.updatedAt || ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  if (filter.mode === 'since') return t >= filter.sinceMs
  return t >= filter.fromMs && t <= filter.toMs
}

export function purgePresetLabel(preset: HistoryPurgePreset): string {
  switch (preset) {
    case 'hour':
      return 'за последний час'
    case 'day':
      return 'за последний день'
    case 'week':
      return 'за 7 дней'
    case 'all':
      return 'всю историю'
    case 'custom':
      return 'за выбранный период'
  }
}

export function cloneHistoryCapture(capture: HistoryCapturePrefs): HistoryCapturePrefs {
  const entities = defaultEntities()
  for (const col of AUDITABLE_COLLECTIONS) {
    entities[col] = { ...capture.entities[col] }
  }
  return {
    entities,
    events: { ...capture.events },
  }
}
