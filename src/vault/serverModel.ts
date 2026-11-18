import { ApiError } from '../api/errors'
import { isSafeEntityId } from './ids'
import type {
  Server,
  ServerBackupPolicy,
  ServerHostSnapshot,
  ServerProjectLink,
  ServerProviderLink,
  ServerSshProfile,
} from './types'

/**
 * Модель сервера для чтения vault и для записи через API.
 *
 * `sanitizeServerLoose` / `normalizeServer` не бросают: битое поле просто
 * выпадает, чтобы старый файл открывался.
 * `parseServerFields` — строгий разбор тела запроса: невалидное значение
 * бросает ApiError. `undefined` в input значит «не менять» (берётся current
 * и ещё раз прогоняется мягко). `null` сбрасывает поле; пустая строка
 * описания тоже снимается.
 *
 * Пароли, токены и ключи сюда не копируются. Ссылки на блобы — это
 * `ssh.secretId` и `backup.passwordRef`, не сами секреты.
 *
 * `links` каноничнее `projectId`: после нормализации `projectId` всегда
 * равен `links[0]?.projectId`. Пустые links и заданный projectId
 * превращаются в один link без root. Запись только `projectId` через
 * `buildServer` двигает первую привязку, не этот шаг.
 */

const SSH_USER = /^[a-z_][a-z0-9_-]{0,31}$/
const DB_NAME = /^[A-Za-z0-9_-]+$/
const BILLING_ID = /^[A-Za-z0-9_-]+$/
const UNIT_NAME = /^[a-z0-9@._-]{1,80}$/
const FP_SHA = /^SHA256:[A-Za-z0-9+/]+={0,2}$/i
const FP_HEX = /^(?=.*[0-9A-Fa-f])[0-9A-Fa-f:]+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/

const MAX = {
  description: 500,
  links: 24,
  path: 240,
  dbName: 63,
  billingId: 80,
  ip: 64,
  os: 80,
  plan: 120,
  location: 80,
  mac: 32,
  action: 80,
  checkedAt: 64,
  fingerprint: 128,
  error: 240,
  includeProjects: 24,
  extraPaths: 20,
  retention: 3650,
} as const

type Mode = 'loose' | 'strict'

export type ServerExtras = Pick<
  Server,
  'description' | 'links' | 'provider' | 'hostSnapshot' | 'ssh' | 'backup' | 'notifyStatus'
>

function reject(mode: Mode, message: string): undefined {
  if (mode === 'strict') throw new ApiError(400, 'validation', message)
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isAbsolutePosix(path: string, max = MAX.path): boolean {
  if (path.length < 1 || path.length > max) return false
  if (!path.startsWith('/')) return false
  if (/\s/.test(path) || path.includes('\\')) return false
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
  }
  return !path.split('/').includes('..')
}

function parsePosix(value: unknown, mode: Mode, label: string): string | undefined {
  if (typeof value !== 'string') return reject(mode, `${label} должен быть абсолютным POSIX-путём`)
  const path = value.trim()
  if (!isAbsolutePosix(path)) return reject(mode, `${label} должен быть абсолютным POSIX-путём`)
  return path
}

function capString(value: unknown, max: number, mode: Mode, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return reject(mode, `${label} должен быть строкой`)
  const next = value.replace(/\r\n/g, '\n').trim().slice(0, max)
  return next || undefined
}

function parseDescription(value: unknown, mode: Mode): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return capString(value, MAX.description, mode, 'Описание')
}

function parseDatabase(value: unknown, mode: Mode): ServerProjectLink['database'] | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'database должна быть объектом')
  if (row.engine !== 'postgres' && row.engine !== 'sqlite') {
    return reject(mode, 'database.engine: postgres или sqlite')
  }
  if (typeof row.name !== 'string') return reject(mode, 'Некорректное имя базы')
  const name = row.name.trim()
  if (!name || name.length > MAX.dbName || !DB_NAME.test(name)) {
    return reject(mode, 'Некорректное имя базы')
  }
  return { engine: row.engine, name }
}

function parseLink(value: unknown, mode: Mode): ServerProjectLink | undefined {
  const row = asRecord(value)
  if (!row) return reject(mode, 'Некорректная привязка проекта')
  if (typeof row.projectId !== 'string') return reject(mode, 'Некорректный projectId в links')
  const projectId = row.projectId.trim()
  if (!isSafeEntityId(projectId)) return reject(mode, 'Некорректный projectId в links')
  const link: ServerProjectLink = { projectId }
  if (row.root !== undefined && row.root !== null && row.root !== '') {
    const root = parsePosix(row.root, mode, 'root')
    if (root) link.root = root
  }
  if (row.database !== undefined && row.database !== null) {
    const database = parseDatabase(row.database, mode)
    if (database) link.database = database
  }
  return link
}

function parseLinks(value: unknown, mode: Mode): ServerProjectLink[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    reject(mode, 'links должен быть массивом')
    return []
  }
  if (mode === 'strict' && value.length > MAX.links) {
    throw new ApiError(400, 'validation', 'Слишком много привязок проектов (максимум 24)')
  }
  const out: ServerProjectLink[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (out.length >= MAX.links) break
    const link = parseLink(item, mode)
    if (!link || seen.has(link.projectId)) continue
    seen.add(link.projectId)
    out.push(link)
  }
  return out
}

function parseProvider(value: unknown, mode: Mode): ServerProviderLink | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'Некорректный provider')
  if (row.kind !== 'spaceweb') return reject(mode, 'provider.kind: spaceweb')
  if (typeof row.billingId !== 'string') return reject(mode, 'Некорректный billingId')
  const billingId = row.billingId.trim()
  if (!billingId || billingId.length > MAX.billingId || !BILLING_ID.test(billingId)) {
    return reject(mode, 'Некорректный billingId')
  }
  return { kind: 'spaceweb', billingId }
}

function parseCheckedAt(value: unknown, mode: Mode): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return reject(mode, 'hostSnapshot.checkedAt должен быть датой')
  const at = value.trim()
  if (!at || at.length > MAX.checkedAt || Number.isNaN(Date.parse(at))) {
    return reject(mode, 'hostSnapshot.checkedAt должен быть датой')
  }
  return at
}

function parseSnapshot(value: unknown, mode: Mode): ServerHostSnapshot | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'hostSnapshot должен быть объектом')
  const snap: ServerHostSnapshot = {}
  const ip = capString(row.ip, MAX.ip, mode, 'hostSnapshot.ip')
  const os = capString(row.os, MAX.os, mode, 'hostSnapshot.os')
  const plan = capString(row.plan, MAX.plan, mode, 'hostSnapshot.plan')
  const location = capString(row.location, MAX.location, mode, 'hostSnapshot.location')
  const mac = capString(row.mac, MAX.mac, mode, 'hostSnapshot.mac')
  const currentAction = capString(row.currentAction, MAX.action, mode, 'hostSnapshot.currentAction')
  const checkedAt = parseCheckedAt(row.checkedAt, mode)
  if (ip) snap.ip = ip
  if (os) snap.os = os
  if (plan) snap.plan = plan
  if (location) snap.location = location
  if (mac) snap.mac = mac
  if (currentAction) snap.currentAction = currentAction
  if (checkedAt) snap.checkedAt = checkedAt
  if (row.isRunning !== undefined && row.isRunning !== null) {
    if (typeof row.isRunning !== 'boolean') {
      if (mode === 'strict') return reject(mode, 'hostSnapshot.isRunning должен быть boolean')
    } else {
      snap.isRunning = row.isRunning
    }
  }
  return Object.keys(snap).length > 0 ? snap : undefined
}

function parseFingerprint(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return undefined
  const fp = value.trim()
  if (!fp || fp.length > MAX.fingerprint) return undefined
  if (FP_SHA.test(fp) || FP_HEX.test(fp)) return fp
  return undefined
}

function parseSsh(value: unknown, mode: Mode): ServerSshProfile | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'Некорректный SSH-профиль')
  const user = typeof row.user === 'string' ? row.user.trim() : ''
  const secretId = typeof row.secretId === 'string' ? row.secretId.trim() : ''
  if (!SSH_USER.test(user)) return reject(mode, 'Некорректный пользователь SSH')
  if (!isSafeEntityId(secretId)) return reject(mode, 'Некорректный secretId')
  let port = 22
  if (row.port !== undefined && row.port !== null) {
    if (typeof row.port !== 'number' || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535) {
      return reject(mode, 'SSH port: целое 1–65535')
    }
    port = row.port
  }
  if (row.auth !== 'key' && row.auth !== 'password') {
    return reject(mode, 'ssh.auth: key или password')
  }
  const profile: ServerSshProfile = { user, port, auth: row.auth, secretId }
  const hostFingerprint = parseFingerprint(row.hostFingerprint)
  if (hostFingerprint) profile.hostFingerprint = hostFingerprint
  return profile
}

function parseCount(value: unknown, mode: Mode): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX.retention) {
    return reject(mode, 'backup.retention: целые 0–3650')
  }
  return value
}

function parseRetention(value: unknown, mode: Mode): ServerBackupPolicy['retention'] | undefined {
  const row = asRecord(value)
  if (!row) return reject(mode, 'backup.retention: целые 0–3650')
  const keepDaily = parseCount(row.keepDaily, mode)
  const keepWeekly = parseCount(row.keepWeekly, mode)
  const keepMonthly = parseCount(row.keepMonthly, mode)
  if (keepDaily === undefined || keepWeekly === undefined || keepMonthly === undefined) return undefined
  return { keepDaily, keepWeekly, keepMonthly }
}

function parseDestination(value: unknown, mode: Mode): ServerBackupPolicy['destination'] | undefined {
  const row = asRecord(value)
  if (!row) return reject(mode, 'backup.destination: local или server')
  if (row.kind === 'local') {
    const path = parsePosix(row.path, mode, 'Путь локального бэкапа')
    if (!path) return undefined
    return { kind: 'local', path }
  }
  if (row.kind === 'server') {
    if (typeof row.serverId !== 'string' || !isSafeEntityId(row.serverId.trim())) {
      return reject(mode, 'Некорректный serverId назначения бэкапа')
    }
    const path = parsePosix(row.path, mode, 'Путь бэкапа на сервере')
    if (!path) return undefined
    return { kind: 'server', serverId: row.serverId.trim(), path }
  }
  return reject(mode, 'backup.destination.kind: local или server')
}

function parseIdList(value: unknown, mode: Mode, max: number, label: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    reject(mode, `Некорректный ${label}`)
    return []
  }
  if (mode === 'strict' && value.length > max) {
    throw new ApiError(400, 'validation', `Слишком много ${label} (максимум ${max})`)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (out.length >= max) break
    if (typeof item !== 'string') {
      reject(mode, `Некорректный ${label}`)
      continue
    }
    const id = item.trim()
    if (!isSafeEntityId(id)) {
      reject(mode, `Некорректный ${label}`)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function parsePathList(value: unknown, mode: Mode): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    reject(mode, 'Некорректный extraPaths')
    return []
  }
  if (mode === 'strict' && value.length > MAX.extraPaths) {
    throw new ApiError(400, 'validation', 'Слишком много extraPaths (максимум 20)')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (out.length >= MAX.extraPaths) break
    const path = parsePosix(item, mode, 'extraPaths')
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

function parseUnit(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return undefined
  const unit = value.trim()
  return UNIT_NAME.test(unit) ? unit : undefined
}

function isIsoDate(value: string): boolean {
  if (value.length > 40 || !ISO_DATE.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

function parseLastRun(value: unknown, mode: Mode): ServerBackupPolicy['lastRun'] | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'Некорректный lastRun')
  if (typeof row.at !== 'string' || !isIsoDate(row.at.trim())) {
    return reject(mode, 'lastRun.at должен быть ISO-датой')
  }
  if (typeof row.ok !== 'boolean') return reject(mode, 'lastRun.ok должен быть boolean')
  const run: NonNullable<ServerBackupPolicy['lastRun']> = { at: row.at.trim(), ok: row.ok }
  if (row.error !== undefined && row.error !== null && row.error !== '') {
    if (typeof row.error !== 'string') return reject(mode, 'lastRun.error должен быть строкой')
    const error = row.error.replace(/\r\n/g, '\n').trim().slice(0, MAX.error)
    if (error) run.error = error
  }
  return run
}

function parseBackup(value: unknown, mode: Mode): ServerBackupPolicy | undefined {
  if (value === undefined || value === null) return undefined
  const row = asRecord(value)
  if (!row) return reject(mode, 'Некорректная политика бэкапа')
  const destination = parseDestination(row.destination, mode)
  const passwordRef = typeof row.passwordRef === 'string' && isSafeEntityId(row.passwordRef.trim())
    ? row.passwordRef.trim()
    : undefined
  const hour =
    typeof row.hour === 'number' && Number.isInteger(row.hour) && row.hour >= 0 && row.hour <= 23
      ? row.hour
      : undefined
  if (!destination || !passwordRef || hour === undefined) {
    if (!destination) return reject(mode, 'Некорректное назначение бэкапа')
    if (!passwordRef) return reject(mode, 'Некорректный passwordRef')
    return reject(mode, 'backup.hour: целое 0–23')
  }
  const retention = parseRetention(row.retention, mode)
  if (!retention) return undefined
  const policy: ServerBackupPolicy = {
    destination,
    passwordRef,
    hour,
    retention,
    includeProjectIds: parseIdList(row.includeProjectIds, mode, MAX.includeProjects, 'includeProjectIds'),
    extraPaths: parsePathList(row.extraPaths, mode),
  }
  const unit = parseUnit(row.unit)
  if (unit) policy.unit = unit
  const lastRun = parseLastRun(row.lastRun, mode)
  if (lastRun) policy.lastRun = lastRun
  return policy
}

function parseNotify(value: unknown, mode: Mode): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') return reject(mode, 'notifyStatus должен быть boolean')
  return value
}

function take<T>(
  input: Record<string, unknown>,
  key: string,
  current: unknown,
  parse: (value: unknown, mode: Mode) => T | undefined,
): T | undefined {
  const value = input[key]
  if (value === undefined) return parse(current, 'loose')
  if (value === null) return undefined
  return parse(value, 'strict')
}

function extrasFrom(source: Partial<Server> | Record<string, unknown>, mode: Mode): ServerExtras {
  const src = source as Record<string, unknown>
  const out: ServerExtras = {}
  const description = parseDescription(src.description, mode)
  if (description) out.description = description
  const links = parseLinks(src.links, mode)
  if (links.length > 0) out.links = links
  const provider = parseProvider(src.provider, mode)
  if (provider) out.provider = provider
  const hostSnapshot = parseSnapshot(src.hostSnapshot, mode)
  if (hostSnapshot) out.hostSnapshot = hostSnapshot
  const ssh = parseSsh(src.ssh, mode)
  if (ssh) out.ssh = ssh
  const backup = parseBackup(src.backup, mode)
  if (backup) out.backup = backup
  const notifyStatus = parseNotify(src.notifyStatus, mode)
  if (notifyStatus !== undefined) out.notifyStatus = notifyStatus
  return out
}

/**
 * Мягкая очистка опциональных полей при чтении.
 * Невалидное отбрасывается, исключения нет. Legacy `projectId` здесь не трогаем —
 * это делает `normalizeServer` / `serverLinks`.
 */
export function sanitizeServerLoose(raw: Partial<Server>): ServerExtras {
  return extrasFrom(raw, 'loose')
}

/**
 * Строгий разбор опциональных полей записи сервера.
 * Вызывающий (`buildServer`) заранее отклоняет ключи-секреты на любой глубине.
 * Этот разбор их не копирует: в объект попадают только известные поля.
 */
export function parseServerFields(
  input: Record<string, unknown>,
  current?: Partial<Server>,
): ServerExtras {
  const out: ServerExtras = {}
  const description = take(input, 'description', current?.description, parseDescription)
  if (description) out.description = description
  const links = take(input, 'links', current?.links, (value, mode) => parseLinks(value, mode))
  if (links && links.length > 0) out.links = links
  const provider = take(input, 'provider', current?.provider, parseProvider)
  if (provider) out.provider = provider
  const hostSnapshot = take(input, 'hostSnapshot', current?.hostSnapshot, parseSnapshot)
  if (hostSnapshot) out.hostSnapshot = hostSnapshot
  const ssh = take(input, 'ssh', current?.ssh, parseSsh)
  if (ssh) out.ssh = ssh
  const backup = take(input, 'backup', current?.backup, parseBackup)
  if (backup) out.backup = backup
  const notifyStatus = take(input, 'notifyStatus', current?.notifyStatus, parseNotify)
  if (notifyStatus !== undefined) out.notifyStatus = notifyStatus
  return out
}

function legacyProjectId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return isSafeEntityId(id) ? id : undefined
}

/** Всегда массив. Пустые links дополняются legacy `projectId`, если он безопасный. */
export function serverLinks(server: { projectId?: string; links?: ServerProjectLink[] }): ServerProjectLink[] {
  const links = parseLinks(server.links, 'loose')
  if (links.length > 0) return links
  const projectId = legacyProjectId(server.projectId)
  return projectId ? [{ projectId }] : []
}

/** Совпадение любого link или legacy `projectId`. */
export function serverHasProject(
  server: { projectId?: string; links?: ServerProjectLink[] },
  projectId: string,
): boolean {
  if (!projectId) return false
  if (server.projectId === projectId) return true
  if (!Array.isArray(server.links)) return false
  return server.links.some((link) => link?.projectId === projectId)
}

/**
 * Чтение vault и финальная форма ответа API.
 * Не требует валидный id и не бросает на грязных опциональных полях.
 * Идемпотентна: повторный вызов не меняет уже нормализованный сервер.
 */
export function normalizeServer(raw: Server): Server {
  const extras = sanitizeServerLoose(raw)
  const links = serverLinks({ projectId: raw.projectId, links: extras.links })
  const server: Server = {
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    name: raw.name,
    host: raw.host,
    specs: raw.specs,
    role: raw.role,
    status: raw.status,
    statusKind: raw.statusKind,
  }
  if (raw.tags !== undefined) server.tags = raw.tags
  if (raw.notes !== undefined) server.notes = raw.notes
  if (links.length > 0) {
    server.links = links
    server.projectId = links[0].projectId
  }
  if (extras.description) server.description = extras.description
  if (extras.provider) server.provider = extras.provider
  if (extras.hostSnapshot) server.hostSnapshot = extras.hostSnapshot
  if (extras.ssh) server.ssh = extras.ssh
  if (extras.backup) server.backup = extras.backup
  if (extras.notifyStatus !== undefined) server.notifyStatus = extras.notifyStatus
  return server
}
