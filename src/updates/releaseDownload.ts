import { check, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from '../vault/runtime'
import { assertInstallTarget } from './userDataGuard'

export type DownloadPhase = 'idle' | 'downloading' | 'installing' | 'ready' | 'error'

export type DownloadSnapshot = {
  phase: DownloadPhase
  received: number
  total: number | null
  percent: number | null
  message: string | null
}

type InstallResult = { ok: boolean; message: string }

const RELEASE_ENDPOINT =
  'https://github.com/alekseevich47/controlcenter/releases/latest/download/latest.json'

const BROWSER_MESSAGE =
  'Скачивание установщика выполняется в установленном приложении на ПК. В браузере доступна только проверка версии.'
const NO_INSTALLER =
  'Опубликованного установщика на GitHub Releases ещё нет. Рабочее дерево не изменено.'
const CHECK_FAILED = 'Не удалось получить установщик релиза. Рабочее дерево не изменено.'
const INSTALL_FAILED = 'Не удалось установить релиз. Файлы пользователя не изменены.'
const SIGNATURE_FAILED =
  'Подпись установщика не сошлась. Файл не установлен, рабочее дерево не изменено.'
const PLATFORM_MISSING =
  'Для этой системы установщика на GitHub Releases нет. Рабочее дерево не изменено.'
const INSTALLED =
  'Установщик релиза установлен. Приложение перезапускается. Файлы пользователя не заменяются.'
const RELAUNCH_FAILED =
  'Установщик релиза установлен. Перезапустите приложение. Файлы пользователя не заменяются.'
const GUARD_FALLBACK = 'Обновление не трогает файлы пользователя. Запись остановлена.'

const SKIP_KEYS = new Set(['signature', 'notes', 'body', 'pub_date', 'pubdate'])

const listeners = new Set<(snap: DownloadSnapshot) => void>()

let snapshot: DownloadSnapshot = {
  phase: 'idle',
  received: 0,
  total: null,
  percent: null,
  message: null,
}

let task: Promise<InstallResult> | null = null

export function getDownloadSnapshot(): DownloadSnapshot {
  return { ...snapshot }
}

export function subscribeDownload(listener: (snap: DownloadSnapshot) => void): () => void {
  listeners.add(listener)
  listener({ ...snapshot })
  return () => {
    listeners.delete(listener)
  }
}

export function startReleaseInstall(): Promise<InstallResult> {
  if ((snapshot.phase === 'downloading' || snapshot.phase === 'installing') && task) {
    return task
  }

  snapshot = {
    phase: 'downloading',
    received: 0,
    total: null,
    percent: null,
    message: null,
  }
  const current = Promise.resolve()
    .then(runReleaseInstall)
    .finally(() => {
      if (task === current) task = null
    })
  task = current
  emit()
  return current
}

async function runReleaseInstall(): Promise<InstallResult> {
  try {
    if (!isTauri()) return finish(false, BROWSER_MESSAGE)

    let update: Awaited<ReturnType<typeof check>>
    try {
      update = await check()
    } catch (error) {
      const detail = errorText(error)
      try {
        guardTargets(null, detail)
      } catch (guardError) {
        return finish(false, guardMessage(guardError))
      }
      return finish(false, failureMessage(detail, true))
    }

    if (!update) return finish(false, NO_INSTALLER)

    try {
      guardTargets(updatePayload(update), null)
    } catch (guardError) {
      await update.close().catch(() => {})
      return finish(false, guardMessage(guardError))
    }

    try {
      await update.downloadAndInstall((event) => {
        try {
          applyDownloadEvent(event)
        } catch {
          // Событие прогресса не пишет файлы и не отменяет уже начатую загрузку плагина.
        }
      })
    } catch (error) {
      await update.close().catch(() => {})
      const detail = errorText(error)
      try {
        guardTargets(null, detail)
      } catch (guardError) {
        return finish(false, guardMessage(guardError))
      }
      return finish(false, failureMessage(detail, false))
    }

    if (snapshot.phase !== 'installing') {
      snapshot = {
        phase: 'installing',
        received: snapshot.received,
        total: snapshot.total,
        percent: percentFor(snapshot.received, snapshot.total),
        message: null,
      }
      emit()
    }

    try {
      await relaunch()
    } catch {
      return finish(true, RELAUNCH_FAILED)
    }
    return finish(true, INSTALLED)
  } catch (error) {
    const detail = errorText(error)
    try {
      guardTargets(null, detail)
    } catch (guardError) {
      return finish(false, guardMessage(guardError))
    }
    return finish(false, failureMessage(detail, true))
  }
}

function applyDownloadEvent(event: DownloadEvent): void {
  if (event.event === 'Started') {
    const total = readByteCount(event.data.contentLength)
    snapshot = {
      phase: 'downloading',
      received: 0,
      total,
      percent: percentFor(0, total),
      message: null,
    }
    emit()
    return
  }

  if (event.event === 'Progress') {
    const chunk = readByteCount(event.data.chunkLength)
    const received = snapshot.received + (chunk ?? 0)
    snapshot = {
      phase: snapshot.phase === 'installing' ? 'installing' : 'downloading',
      received,
      total: snapshot.total,
      percent: percentFor(received, snapshot.total),
      message: null,
    }
    emit()
    return
  }

  snapshot = {
    phase: 'installing',
    received: snapshot.received,
    total: snapshot.total,
    percent: percentFor(snapshot.received, snapshot.total),
    message: null,
  }
  emit()
}

function percentFor(received: number, total: number | null): number | null {
  if (total == null || !(total > 0)) return null
  const raw = Math.round((received / total) * 100)
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return 0
  if (raw >= 100) return 100
  return raw
}

function readByteCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

function updatePayload(update: {
  version: string
  currentVersion: string
  date?: string
  body?: string
  rawJson: Record<string, unknown>
}): unknown {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date ?? null,
    rawJson: update.rawJson,
  }
}

function guardTargets(payload: unknown, errorText: string | null): void {
  const paths: string[] = []
  const urls: string[] = []
  collectTargets(payload, null, paths, urls, 0)
  if (errorText) {
    for (const path of localPathsIn(errorText)) paths.push(path)
  }

  const uniquePaths = [...new Set(paths)]
  if (uniquePaths.length > 0) {
    for (const path of uniquePaths) assertInstallTarget(path)
  } else if (errorText) {
    const scrubbed = scrubSecrets(errorText).trim()
    if (scrubbed) assertInstallTarget(scrubbed.slice(0, 500))
  }

  assertInstallTarget(RELEASE_ENDPOINT)
  for (const url of new Set(urls)) {
    if (url !== RELEASE_ENDPOINT) assertInstallTarget(url)
  }
}

function collectTargets(
  value: unknown,
  key: string | null,
  paths: string[],
  urls: string[],
  depth: number,
): void {
  if (depth > 8 || paths.length + urls.length > 64) return
  if (key && SKIP_KEYS.has(key.toLowerCase())) return
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text || text.length > 2048) return
    if (/^https?:\/\//i.test(text)) {
      urls.push(text)
      return
    }
    if (isLocalPath(text)) paths.push(text)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTargets(item, null, paths, urls, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [childKey, child] of Object.entries(value)) {
    collectTargets(child, childKey, paths, urls, depth + 1)
  }
}

function isLocalPath(text: string): boolean {
  if (text.startsWith('file:')) return true
  if (/^[a-zA-Z]:[\\/]/.test(text)) return true
  if (text.startsWith('\\\\')) return true
  return text.startsWith('/') && !text.startsWith('//')
}

function localPathsIn(text: string): string[] {
  const found: string[] = []
  const patterns = [
    /file:\/\/[^\s"'<>]+/gi,
    /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\\]+\\)*[^\\/:*?"<>|\r\n\\]*/g,
    /\\\\[^\s"'<>|]+/g,
    /\/(?:[\w.@+-]+\/)*[\w.@+-]*(?:lcc-vault|\.lcc)(?:\/[\w.@+-]+)*/gi,
  ]
  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) found.push(...matches)
  }
  return found
}

function failureMessage(detail: string, duringCheck: boolean): string {
  const lower = detail.toLowerCase()
  if (
    lower.includes('could not fetch a valid release json') ||
    lower.includes('release not found') ||
    lower.includes('status code 404') ||
    lower.includes('status: 404') ||
    /\b404\b/.test(lower)
  ) {
    return NO_INSTALLER
  }
  if (lower.includes('platform') && lower.includes('not found')) return PLATFORM_MISSING
  if (
    lower.includes('signature') ||
    lower.includes('minisign') ||
    lower.includes('pubkey') ||
    lower.includes('base64')
  ) {
    return SIGNATURE_FAILED
  }
  return duringCheck ? CHECK_FAILED : INSTALL_FAILED
}

function guardMessage(error: unknown): string {
  const text = error instanceof Error ? error.message.trim() : ''
  if (!text || !isPublicText(text)) return GUARD_FALLBACK
  return text.replace(/[\r\n]/g, ' ').slice(0, 400)
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return ''
}

function scrubSecrets(text: string): string {
  return text
    .replace(/ghp_[A-Za-z0-9]+/g, '')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '')
    .replace(/gho_[A-Za-z0-9]+/g, '')
    .replace(/x-access-token[:\s=]+\S+/gi, '')
    .replace(/bearer\s+\S+/gi, '')
    .replace(/untrusted comment:\s*minisign secret key[\s\S]*/gi, '')
    .replace(/TAURI_SIGNING_PRIVATE_KEY\S*/g, '')
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, '')
}

function isPublicText(text: string): boolean {
  if (text.length > 400) return false
  return !/ghp_|github_pat_|gho_|x-access-token|bearer\s+\S|minisign secret|private key|TAURI_SIGNING_PRIVATE_KEY/i.test(
    text,
  )
}

function finish(ok: boolean, message: string): InstallResult {
  snapshot = {
    phase: ok ? 'ready' : 'error',
    received: snapshot.received,
    total: snapshot.total,
    percent: snapshot.percent,
    message,
  }
  emit()
  return { ok, message }
}

function emit(): void {
  const next = { ...snapshot }
  for (const listener of listeners) {
    try {
      listener(next)
    } catch {
      // Размонтирование страницы загрузку не отменяет.
    }
  }
}
