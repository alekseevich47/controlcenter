import { parseSemver } from './semver'

export type PendingUpdate = {
  version: string
  build: string
  title: string
  highlights: string[]
  checkedAt: string
}

const STORAGE_KEY = 'lcc.update.pending.v1'
const TITLE_LIMIT = 180
const HIGHLIGHT_LIMIT = 12
const HIGHLIGHT_CHARS = 240

/** Пробел, прочие whitespace и управляющие C0/C1. */
function isSpaceOrControl(code: number): boolean {
  if (code <= 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  if (code >= 0x2000 && code <= 0x200a) return true
  return (
    code === 0xa0 ||
    code === 0x1680 ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  )
}

function validBuild(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 40) return false
  for (let index = 0; index < value.length; index += 1) {
    if (isSpaceOrControl(value.charCodeAt(index))) return false
  }
  return true
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function clampHighlights(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const highlights: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return null
    highlights.push(item)
  }
  return highlights.slice(0, HIGHLIGHT_LIMIT).map((item) => item.slice(0, HIGHLIGHT_CHARS))
}

function validCheckedAt(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function normalizePending(value: unknown): PendingUpdate | null {
  const row = asRecord(value)
  if (!row) return null
  if (typeof row.version !== 'string' || !parseSemver(row.version)) return null
  if (!validBuild(row.build)) return null
  if (typeof row.title !== 'string') return null
  const highlights = clampHighlights(row.highlights)
  if (!highlights) return null
  if (!validCheckedAt(row.checkedAt)) return null
  return {
    version: row.version,
    build: row.build,
    title: row.title.trim().slice(0, TITLE_LIMIT),
    highlights,
    checkedAt: row.checkedAt,
  }
}

function dropKey(store: Storage): void {
  store.removeItem(STORAGE_KEY)
}

export function readPendingUpdate(): PendingUpdate | null {
  const store = browserStorage()
  if (!store) return null
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (raw == null) return null
    let json: unknown
    try {
      json = JSON.parse(raw) as unknown
    } catch {
      dropKey(store)
      return null
    }
    const pending = normalizePending(json)
    if (!pending) {
      dropKey(store)
      return null
    }
    return pending
  } catch {
    return null
  }
}

export function writePendingUpdate(value: PendingUpdate): void {
  const store = browserStorage()
  if (!store) return
  try {
    const pending = normalizePending(value)
    if (!pending) return
    store.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // квота, приватный режим или отключённое хранилище
  }
}

export function clearPendingUpdate(): void {
  const store = browserStorage()
  if (!store) return
  try {
    dropKey(store)
  } catch {
    // хранилище может бросить — наружу не пробрасываем
  }
}
