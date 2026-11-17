/**
 * Граница данных пользователя для установщика релиза.
 * Цель установки — только каталог приложения. Vault и выбранная папка
 * (зашифрованные файлы, `.lcc`, коллекции) в пакет не входят.
 */
import { COLLECTIONS } from '../vault/types'

const VAULT_DIR = 'lcc-vault'
const LCC_DIR = '.lcc'

/** Файлы `.lcc` и служебные файлы внутри vault. */
const VAULT_FILE_NAMES: ReadonlySet<string> = new Set([
  'github.enc',
  'spaceweb.enc',
  'api-token.enc',
  'prefs.json',
  'probe.enc',
  'meta.json',
])

/** Каталоги коллекций `{id}.json.enc` на диске. */
const COLLECTION_SEGMENTS: ReadonlySet<string> = new Set(COLLECTIONS)

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

function pathSegments(normalized: string): string[] {
  return normalized.split('/').filter((segment) => segment.length > 0)
}

/**
 * Путь нельзя считать целью установки.
 * Пустая строка и любой путь с `..` — недоверенные.
 * Дальше сравнение без регистра, слеши приведены к `/`.
 */
export function isUserDataPath(path: string): boolean {
  if (path.length === 0 || path.includes('..')) return true

  const normalized = normalizePath(path)
  const segments = pathSegments(normalized)
  const name = segments[segments.length - 1] ?? ''
  const parent = segments[segments.length - 2] ?? ''
  const inVaultTree = normalized.includes(VAULT_DIR)

  if (segments.some((segment) => segment === VAULT_DIR || segment === LCC_DIR)) return true

  if (VAULT_FILE_NAMES.has(name) && (parent === LCC_DIR || inVaultTree)) return true

  if (
    name.endsWith('.json.enc') &&
    (inVaultTree || segments.some((segment) => COLLECTION_SEGMENTS.has(segment)))
  ) {
    return true
  }

  return false
}

/** Бросает, если установщик целится в данные пользователя. */
export function assertInstallTarget(path: string): void {
  if (isUserDataPath(path)) {
    throw new Error('Обновление не трогает файлы пользователя')
  }
}
