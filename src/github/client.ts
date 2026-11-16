import { parseGithubRepo } from './repo'
import type { GithubRepoLink } from '../vault/types'

const API_ORIGIN = 'https://api.github.com'
const TIMEOUT_MS = 12_000

export class GithubError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubError'
    this.status = status
  }
}

export type GithubRepoInfo = {
  fullName: string
  description: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
  openIssues: number
  pushedAt: string
}

export type GithubCommitInfo = {
  sha: string
  message: string
  date: string
  url: string
  author: string
}

export type GithubPullInfo = {
  number: number
  title: string
  url: string
  author: string
  updatedAt: string
}

function assertApiUrl(url: URL): void {
  if (url.origin !== API_ORIGIN || url.username || url.password) {
    throw new GithubError('Запрос вне api.github.com запрещён', 0)
  }
}

function errorMessage(status: number, body: unknown): string {
  if (status === 401) {
    return 'GitHub отклонил токен. Нужны права Metadata и Contents (Read), для PR — Pull requests (Read).'
  }
  if (status === 403 || status === 429) {
    return 'GitHub ограничил запросы или доступ к репозиторию. Подождите и повторите.'
  }
  if (status === 404) return 'Репозиторий не найден или токен его не видит.'
  const row = body && typeof body === 'object' ? (body as { message?: unknown }).message : null
  if (typeof row === 'string' && row.trim() && !/token|authorization/i.test(row)) {
    return row.trim().slice(0, 180)
  }
  return `GitHub ответил ${status || 'ошибкой сети'}`
}

async function githubFetch(
  pathAndQuery: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!pathAndQuery.startsWith('/') || pathAndQuery.startsWith('//') || pathAndQuery.includes('://')) {
    throw new GithubError('Некорректный путь GitHub API', 0)
  }
  const url = new URL(pathAndQuery, API_ORIGIN)
  assertApiUrl(url)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    let res: Response
    try {
      res = await fetch(url, { headers, signal: ctrl.signal, cache: 'no-store' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new GithubError('GitHub не ответил вовремя', 0)
      }
      throw new GithubError('Нет соединения с GitHub', 0)
    }
    const text = await res.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text) as unknown
      } catch {
        json = null
      }
    }
    if (!res.ok) throw new GithubError(errorMessage(res.status, json), res.status)
    return json
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export async function githubWhoAmI(token: string, signal?: AbortSignal): Promise<string> {
  const json = asRecord(await githubFetch('/user', token, signal))
  const login = json && typeof json.login === 'string' ? json.login.trim() : ''
  if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) {
    throw new GithubError('GitHub не вернул логин', 0)
  }
  return login
}

export function repoQuery(link: GithubRepoLink): string {
  const parsed = parseGithubRepo(`${link.owner}/${link.repo}`)
  if (!parsed) throw new GithubError('Некорректная привязка репозитория', 0)
  return `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
}

export async function githubRepo(
  link: GithubRepoLink,
  token: string | null,
  signal?: AbortSignal,
): Promise<GithubRepoInfo> {
  const json = asRecord(await githubFetch(repoQuery(link), token, signal))
  if (!json) throw new GithubError('Пустой ответ GitHub', 0)
  const fullName = typeof json.full_name === 'string' ? json.full_name : `${link.owner}/${link.repo}`
  return {
    fullName,
    description: typeof json.description === 'string' ? json.description.slice(0, 300) : '',
    private: Boolean(json.private),
    defaultBranch: typeof json.default_branch === 'string' ? json.default_branch.slice(0, 120) : 'main',
    htmlUrl:
      typeof json.html_url === 'string' && json.html_url.startsWith('https://github.com/')
        ? json.html_url
        : `https://github.com/${link.owner}/${link.repo}`,
    openIssues: typeof json.open_issues_count === 'number' ? json.open_issues_count : 0,
    pushedAt: typeof json.pushed_at === 'string' ? json.pushed_at : '',
  }
}

export async function githubCommits(
  link: GithubRepoLink,
  token: string | null,
  signal?: AbortSignal,
): Promise<GithubCommitInfo[]> {
  const json = await githubFetch(`${repoQuery(link)}/commits?per_page=8`, token, signal)
  if (!Array.isArray(json)) return []
  const out: GithubCommitInfo[] = []
  for (const row of json) {
    const rec = asRecord(row)
    if (!rec) continue
    const sha = typeof rec.sha === 'string' ? rec.sha : ''
    const commit = asRecord(rec.commit)
    const message = commit && typeof commit.message === 'string' ? commit.message.split('\n')[0] ?? '' : ''
    const author = asRecord(commit?.author)
    const date = author && typeof author.date === 'string' ? author.date : ''
    const authorName = author && typeof author.name === 'string' ? author.name : ''
    const html = typeof rec.html_url === 'string' ? rec.html_url : ''
    if (!sha) continue
    out.push({
      sha: sha.slice(0, 40),
      message: message.slice(0, 180) || sha.slice(0, 7),
      date,
      url: html.startsWith('https://github.com/') ? html : `https://github.com/${link.owner}/${link.repo}/commit/${sha}`,
      author: authorName.slice(0, 80),
    })
  }
  return out
}

export async function githubPulls(
  link: GithubRepoLink,
  token: string | null,
  signal?: AbortSignal,
): Promise<GithubPullInfo[]> {
  const json = await githubFetch(`${repoQuery(link)}/pulls?state=open&per_page=10`, token, signal)
  if (!Array.isArray(json)) return []
  const out: GithubPullInfo[] = []
  for (const row of json) {
    const rec = asRecord(row)
    if (!rec || typeof rec.number !== 'number') continue
    const user = asRecord(rec.user)
    const url = typeof rec.html_url === 'string' ? rec.html_url : ''
    out.push({
      number: rec.number,
      title: typeof rec.title === 'string' ? rec.title.slice(0, 180) : `PR #${rec.number}`,
      url: url.startsWith('https://github.com/')
        ? url
        : `https://github.com/${link.owner}/${link.repo}/pull/${rec.number}`,
      author: user && typeof user.login === 'string' ? user.login.slice(0, 80) : '',
      updatedAt: typeof rec.updated_at === 'string' ? rec.updated_at : '',
    })
  }
  return out
}
