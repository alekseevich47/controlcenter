import type { Collection, CollectionMap, VaultEvent } from './types'

export type AuditAction = 'create' | 'update' | 'delete' | 'note'

export const COLLECTION_LABELS: Record<Collection, string> = {
  projects: 'Проекты',
  clients: 'Клиенты',
  servers: 'Серверы',
  domains: 'Домены',
  docs: 'Документы',
  campaigns: 'Кампании',
  finance: 'Финансы',
  secrets: 'Секреты',
  events: 'События',
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  note: 'Событие',
}

export type JsonDict = Record<string, unknown>

export type DiffKind = 'added' | 'removed' | 'changed' | 'same'

export type DiffRow = {
  key: string
  before: unknown
  after: unknown
  kind: DiffKind
}

const SKIP_KEYS = new Set(['updatedAt'])

/**
 * Поля, которые не кладём в audit-снимки (шум / объём).
 * Срабатывает на любой глубине. `secretId` и `passwordRef` — это id, их не скрываем.
 */
const REDACT_STORE = new Set([
  'body',
  'token',
  'password',
  'secret',
  'authorization',
  'pat',
  'privateKey',
  'passphrase',
  'credential',
  'credentials',
])

export function normalizeAction(raw?: string): AuditAction {
  if (raw === 'create' || raw === 'update' || raw === 'delete' || raw === 'note') return raw
  return 'note'
}

export function entityLabel(_collection: Collection, entity: CollectionMap[Collection]): string {
  const row = entity as unknown as JsonDict
  for (const key of ['name', 'title', 'domain'] as const) {
    const v = row[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return entity.id
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item))
  if (!value || typeof value !== 'object') return value
  const out: JsonDict = {}
  for (const [k, v] of Object.entries(value as JsonDict)) {
    if (REDACT_STORE.has(k)) {
      out[k] = v == null || v === '' ? v : '«скрыто в истории»'
      continue
    }
    out[k] = redactValue(v)
  }
  return out
}

export function snapshotEntity(entity: CollectionMap[Collection] | null | undefined): JsonDict | null {
  if (!entity) return null
  return redactValue(entity) as JsonDict
}

export function changedKeys(before: JsonDict | null, after: JsonDict | null): string[] {
  return buildDiff(before, after)
    .filter((r) => r.kind !== 'same')
    .map((r) => r.key)
}

export function buildDiff(before: JsonDict | null, after: JsonDict | null): DiffRow[] {
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])
  const rows: DiffRow[] = []
  for (const key of [...keys].sort()) {
    if (SKIP_KEYS.has(key)) continue
    const b = before ? before[key] : undefined
    const a = after ? after[key] : undefined
    const hasB = before != null && key in before
    const hasA = after != null && key in after
    if (!hasB && hasA) {
      rows.push({ key, before: undefined, after: a, kind: 'added' })
      continue
    }
    if (hasB && !hasA) {
      rows.push({ key, before: b, after: undefined, kind: 'removed' })
      continue
    }
    if (stableStringify(b) === stableStringify(a)) {
      rows.push({ key, before: b, after: a, kind: 'same' })
    } else {
      rows.push({ key, before: b, after: a, kind: 'changed' })
    }
  }
  return rows
}

export function summarizeChange(
  action: AuditAction,
  collection: Collection,
  label: string,
  keys: string[],
): string {
  const col = COLLECTION_LABELS[collection]
  if (action === 'create') return `Создан объект «${label}» в «${col}»`
  if (action === 'delete') return `Удалён объект «${label}» из «${col}»`
  if (keys.length === 0) return `Обновлён «${label}» (${col})`
  const shown = keys.slice(0, 4).join(', ')
  const more = keys.length > 4 ? ` и ещё ${keys.length - 4}` : ''
  return `Изменён «${label}» (${col}): ${shown}${more}`
}

export function formatAuditWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value === '' ? '«пусто»' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function eventMatchesQuery(event: VaultEvent, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    event.title,
    event.when,
    event.actor,
    event.actorRole,
    event.entityLabel,
    event.entityId,
    event.collection,
    event.action,
    ...(event.changedKeys ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as JsonDict
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function buildAuditEvent(input: {
  action: AuditAction
  collection: Collection
  entityId: string
  entityLabel: string
  actor: string
  actorRole: string
  before: JsonDict | null
  after: JsonDict | null
}): VaultEvent {
  const now = new Date().toISOString()
  const keys = changedKeys(input.before, input.after)
  const title = summarizeChange(input.action, input.collection, input.entityLabel, keys)
  return {
    id: `evt-${crypto.randomUUID().slice(0, 10)}`,
    createdAt: now,
    updatedAt: now,
    title,
    when: formatAuditWhen(now),
    action: input.action,
    collection: input.collection,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    actor: input.actor.trim() || 'Неизвестно',
    actorRole: input.actorRole,
    before: input.before,
    after: input.after,
    changedKeys: keys,
  }
}
