import { isNewerVersion, parseSemver } from './semver'

export type ReleaseNotes = {
  version: string
  title: string
  highlights: string[]
}

export type RemoteRelease = {
  version: string
  build: string
  title: string
  highlights: string[]
  notes: ReleaseNotes[]
}

export type RemoteManifest = {
  version: string
  entries: ReleaseNotes[]
}

/** Ровно эти URL. Без query, токена и склейки. */
const MANIFEST_URL =
  'https://raw.githubusercontent.com/alekseevich47/controlcenter/main/update-manifest.json'
const PACKAGE_URL =
  'https://raw.githubusercontent.com/alekseevich47/controlcenter/main/package.json'
const COMMIT_URL = 'https://api.github.com/repos/alekseevich47/controlcenter/commits/main'

const ALLOWED_URLS = new Set([MANIFEST_URL, PACKAGE_URL, COMMIT_URL])
const TIMEOUT_MS = 12_000
const HIGHLIGHT_LIMIT = 8
const MAX_BODY_CHARS = 512_000
const NETWORK_ERROR = 'Не удалось проверить версию репозитория'
const ORIGIN_ERROR = 'Ответ пришёл с другого адреса'
const MANIFEST_ERROR = 'Манифест обновления повреждён'
const PACKAGE_ERROR = 'В package.json нет версии репозитория'
const FALLBACK_LINE = 'Изменения в ветке main'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function clipHighlights(highlights: readonly string[]): string[] {
  return highlights.slice(0, HIGHLIGHT_LIMIT)
}

function parseEntry(value: unknown): ReleaseNotes | null {
  const row = asRecord(value)
  if (!row) return null
  if (typeof row.version !== 'string' || !parseSemver(row.version)) return null
  if (typeof row.title !== 'string') return null
  if (!Array.isArray(row.highlights)) return null
  const highlights: string[] = []
  for (const item of row.highlights) {
    if (typeof item !== 'string') return null
    highlights.push(item.trim())
  }
  return { version: row.version, title: row.title.trim(), highlights }
}

/** Разбор JSON манифеста. Лишние поля игнорируются, битая version — null. */
export function parseRemoteManifest(input: unknown): RemoteManifest | null {
  const row = asRecord(input)
  if (!row) return null
  if (typeof row.version !== 'string' || !parseSemver(row.version)) return null
  if (!Array.isArray(row.entries)) return null
  const entries: ReleaseNotes[] = []
  for (const item of row.entries) {
    const entry = parseEntry(item)
    if (entry) entries.push(entry)
  }
  return { version: row.version, entries }
}

function sameVersion(left: string, right: string): boolean {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) return false
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

/** notes — записи строго новее local, в порядке файла. highlights не длиннее 8. */
export function releaseFromManifest(
  manifest: RemoteManifest,
  localVersion: string,
  build: string,
): RemoteRelease {
  const notes: ReleaseNotes[] = []
  for (const entry of manifest.entries) {
    if (!isNewerVersion(entry.version, localVersion)) continue
    notes.push({
      version: entry.version,
      title: entry.title,
      highlights: clipHighlights(entry.highlights),
    })
  }
  const current = manifest.entries.find((entry) => sameVersion(entry.version, manifest.version))
  const head = notes[0] ?? current
  return {
    version: manifest.version,
    build,
    title: head?.title ?? '',
    highlights: clipHighlights(head?.highlights ?? []),
    notes,
  }
}

function readShortSha(sha: unknown): string | null {
  if (typeof sha !== 'string') return null
  const build = sha.slice(0, 7)
  return /^[0-9a-f]{7}$/.test(build) ? build : null
}

/** Первые 7 символов sha, только [0-9a-f]. Иначе version. */
export function buildFromSha(sha: unknown, version: string): string {
  return readShortSha(sha) ?? version
}

/** title — первая строка; highlights — остальные непустые, до 8, либо одна строка-заглушка. */
export function notesFromCommitMessage(message: string): { title: string; highlights: string[] } {
  const text = typeof message === 'string' ? message : ''
  const lines = text.split(/\r\n|\n|\r/)
  const title = (lines[0] ?? '').trim()
  const rest = lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, HIGHLIGHT_LIMIT)
  if (rest.length === 0) {
    return { title: title || FALLBACK_LINE, highlights: [FALLBACK_LINE] }
  }
  return { title, highlights: rest }
}

async function drain(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // тело не читаем и не логируем
  }
}

async function readBody(response: Response): Promise<string> {
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new Error(NETWORK_ERROR)
  }
  if (text.length > MAX_BODY_CHARS) throw new Error(NETWORK_ERROR)
  return text
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function assertResponseOrigin(response: Response, expectedOrigin: string): void {
  let actual: URL
  try {
    actual = new URL(response.url)
  } catch {
    throw new Error(ORIGIN_ERROR)
  }
  if (actual.origin !== expectedOrigin || actual.username || actual.password) {
    throw new Error(ORIGIN_ERROR)
  }
}

async function fetchPublic(url: string, signal?: AbortSignal): Promise<Response> {
  if (!ALLOWED_URLS.has(url)) throw new Error(ORIGIN_ERROR)
  const expected = new URL(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  else signal?.addEventListener('abort', onAbort)
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      })
    } catch {
      throw new Error(NETWORK_ERROR)
    }
    try {
      assertResponseOrigin(response, expected.origin)
    } catch (error) {
      await drain(response)
      throw error
    }
    return response
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function loadManifest(signal?: AbortSignal): Promise<RemoteManifest | null> {
  const response = await fetchPublic(MANIFEST_URL, signal)
  if (response.status === 404) {
    await drain(response)
    return null
  }
  if (!response.ok) {
    await drain(response)
    throw new Error(NETWORK_ERROR)
  }
  const json = parseJson(await readBody(response))
  if (json === undefined) return null
  const manifest = parseRemoteManifest(json)
  if (!manifest) throw new Error(MANIFEST_ERROR)
  return manifest
}

async function loadPackageVersion(signal?: AbortSignal): Promise<string> {
  const response = await fetchPublic(PACKAGE_URL, signal)
  if (!response.ok) {
    await drain(response)
    throw new Error(NETWORK_ERROR)
  }
  const json = parseJson(await readBody(response))
  const row = asRecord(json)
  const version = row && typeof row.version === 'string' ? row.version : ''
  if (!parseSemver(version)) throw new Error(PACKAGE_ERROR)
  return version
}

function readCommitMessage(json: unknown): string {
  const row = asRecord(json)
  const commit = row ? asRecord(row.commit) : null
  return commit && typeof commit.message === 'string' ? commit.message : ''
}

async function loadCommit(
  signal?: AbortSignal,
): Promise<{ build: string | null; title: string; highlights: string[] }> {
  const response = await fetchPublic(COMMIT_URL, signal)
  if (!response.ok) {
    await drain(response)
    return { build: null, ...notesFromCommitMessage('') }
  }
  const json = parseJson(await readBody(response))
  if (json === undefined) return { build: null, ...notesFromCommitMessage('') }
  const row = asRecord(json)
  return {
    build: readShortSha(row?.sha),
    ...notesFromCommitMessage(readCommitMessage(json)),
  }
}

export async function fetchRemoteRelease(localVersion: string, signal?: AbortSignal): Promise<RemoteRelease> {
  const [manifest, commit] = await Promise.all([loadManifest(signal), loadCommit(signal)])
  if (manifest) {
    return releaseFromManifest(manifest, localVersion, commit.build ?? manifest.version)
  }

  const version = await loadPackageVersion(signal)
  const title = commit.title
  const highlights = commit.highlights
  const notes: ReleaseNotes[] = isNewerVersion(version, localVersion)
    ? [{ version, title, highlights }]
    : []
  return {
    version,
    build: commit.build ?? version,
    title,
    highlights,
    notes,
  }
}
