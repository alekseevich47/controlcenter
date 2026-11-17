import { serverLinks } from '../../vault/serverModel'
import type { Server, ServerStatusKind } from '../../vault/types'

export const SERVER_LIMITS = {
  name: 120,
  host: 200,
  specs: 200,
  role: 120,
  description: 500,
  path: 240,
  dbName: 63,
  links: 24,
} as const

export const SERVER_ROLES = ['Production', 'Test', 'Backup', 'Home Lab'] as const

export const SERVER_TABS = [
  { id: 'overview', label: 'Обзор', hint: 'Паспорт, проекты и доступ' },
  { id: 'monitoring', label: 'Мониторинг', hint: 'Замеры хоста' },
  { id: 'console', label: 'Консоль', hint: 'Команды на хосте' },
  { id: 'files', label: 'Файлы', hint: 'Каталог на хосте' },
  { id: 'journals', label: 'Журналы', hint: 'Операции хостера и журналы ОС' },
  { id: 'backups', label: 'Бэкапы', hint: 'Свои копии LCC' },
  { id: 'settings', label: 'Настройки', hint: 'Карточка, связи и удаление' },
] as const

export type ServerTabId = (typeof SERVER_TABS)[number]['id']

const DB_NAME = /^[A-Za-z0-9_-]+$/

export function isServerTab(value: string | undefined): value is ServerTabId {
  return SERVER_TABS.some((tab) => tab.id === value)
}

export function serverPath(id: string, tab: ServerTabId = 'overview'): string {
  return `/servers/${encodeURIComponent(id)}/${tab}`
}

export function serverListPath(id: string): string {
  return `/servers?open=${encodeURIComponent(id)}`
}

export function clip(value: string, max: number): string {
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

/** Пустые строки в карточке выглядят как прочерк, как в старых записях. */
export function orDash(value: string): string {
  return value.trim() || '—'
}

export function blankStored(value: string): string {
  return value === '—' ? '' : value
}

export function serverDescription(server: Server): string {
  const text = server.description?.replace(/\s+/g, ' ').trim()
  return text || 'Без описания'
}

export function providerLabel(server: Server): string {
  return server.provider?.kind ?? 'без хостера'
}

export function statusDotClass(kind: ServerStatusKind): string {
  if (kind === 'red') return 'is-red'
  if (kind === 'amber') return 'is-amber'
  return 'is-on'
}

export function formatCheckedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function destinationLabel(kind: 'local' | 'server'): string {
  return kind === 'local' ? 'Это устройство' : 'Другой сервер'
}

/** Абсолютный POSIX: с `/`, без пробелов и без сегмента `..`. Пустое — норма. */
export function rootError(raw: string): string | null {
  const path = raw.trim()
  if (!path) return null
  if (path.length > SERVER_LIMITS.path) return `Путь длиннее ${SERVER_LIMITS.path} символов`
  if (!path.startsWith('/')) return 'Путь должен начинаться с /'
  if (/\s/.test(path)) return 'В пути не должно быть пробелов'
  if (path.includes('\\')) return 'Путь должен быть POSIX, без \\'
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return 'В пути есть управляющий символ'
  }
  if (path.split('/').includes('..')) return 'Сегмент «..» запрещён'
  return null
}

export function databaseError(engine: string, name: string): string | null {
  const dbName = name.trim()
  if (!engine && !dbName) return null
  if (engine !== 'postgres' && engine !== 'sqlite') return 'Выберите postgres или sqlite'
  if (!dbName) return 'Укажите имя базы'
  if (dbName.length > SERVER_LIMITS.dbName || !DB_NAME.test(dbName)) {
    return 'Имя базы: латиница, цифры, _ и -, до 63'
  }
  return null
}

export function previewFacts(server: Server): { label: string; value: string }[] {
  const snap = server.hostSnapshot
  const fromSnap = [
    snap?.ip ? { label: 'IP', value: snap.ip } : null,
    snap?.os ? { label: 'ОС', value: snap.os } : null,
    snap?.plan ? { label: 'План', value: snap.plan } : null,
    snap?.location ? { label: 'Локация', value: snap.location } : null,
  ].filter((row): row is { label: string; value: string } => row !== null)
  if (fromSnap.length > 0) return fromSnap
  return [
    { label: 'Хост', value: server.host || '—' },
    { label: 'Ресурсы', value: server.specs || '—' },
  ]
}

export function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Не удалось сохранить'
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const SERVER_MOTION_MS = 280

export type LinkDraft = {
  key: string
  projectId: string
  root: string
  engine: '' | 'postgres' | 'sqlite'
  dbName: string
}

export function linkDrafts(server: Server): LinkDraft[] {
  return serverLinks(server).map((link) => ({
    key: crypto.randomUUID(),
    projectId: link.projectId,
    root: link.root ?? '',
    engine: link.database?.engine ?? '',
    dbName: link.database?.name ?? '',
  }))
}
