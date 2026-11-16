import {
  githubCommits,
  githubPulls,
  githubRepo,
  GithubError,
} from '../github/client'
import { parseGithubRepo } from '../github/repo'
import type { GithubRepoLink } from '../vault/types'
import { ApiError, isApiError, toApiError } from './errors'
import { bearerMatches } from './token'
import { assertPlainObject } from './validate'
import type { VaultApi } from './vaultApi'

export type ApiHttpRequest = {
  method: string
  path: string
  query: URLSearchParams
  bodyText: string
  bearer: string | null
}

export type ApiHttpResponse = {
  status: number
  body: unknown
}

export type ApiHttpDeps = {
  api: VaultApi
  expectedToken: string | null
  githubStatus: () => Promise<{ connected: boolean; login: string | null }>
  githubToken: () => Promise<string | null>
  githubConnect: (token: string) => Promise<{ login: string }>
  githubDisconnect: () => Promise<void>
  limiter?: { allow: () => boolean }
}

const SENSITIVE_QUERY = /token|password|secret|authorization|bearer/i

function jsonError(status: number, code: string, message: string): ApiHttpResponse {
  return { status, body: { error: code, message } }
}

function parseBody(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new ApiError(400, 'validation', 'Невалидный JSON')
  }
  return assertPlainObject(value)
}

function repoFromQuery(query: URLSearchParams): GithubRepoLink {
  const owner = query.get('owner') ?? ''
  const repo = query.get('repo') ?? ''
  const link = parseGithubRepo(`${owner}/${repo}`)
  if (!link) throw new ApiError(400, 'validation', 'Нужны корректные owner и repo')
  return link
}

export async function handleApiRequest(deps: ApiHttpDeps, req: ApiHttpRequest): Promise<ApiHttpResponse> {
  try {
    if (deps.limiter && !deps.limiter.allow()) {
      return jsonError(429, 'rate_limited', 'Слишком много запросов к локальному API')
    }
    const method = req.method.toUpperCase()
    if (method === 'OPTIONS' || method === 'TRACE' || method === 'CONNECT') {
      return jsonError(405, 'method_not_allowed', 'Метод не поддерживается')
    }
    for (const key of req.query.keys()) {
      if (SENSITIVE_QUERY.test(key)) {
        return jsonError(400, 'validation', 'Секреты в строке запроса запрещены')
      }
    }

    const path = req.path.replace(/\/+$/, '') || '/'
    if (path.includes('..') || path.includes('\\') || path.includes('%')) {
      return jsonError(400, 'validation', 'Некорректный путь')
    }

    const authed = bearerMatches(deps.expectedToken, req.bearer)
    if (method === 'GET' && path === '/v1/health') {
      return { status: 200, body: { ok: true, service: 'lcc', authorized: authed } }
    }
    if (!authed) return jsonError(401, 'unauthorized', 'Нужен заголовок Authorization: Bearer')

    if (path === '/v1/github/status' && method === 'GET') {
      return { status: 200, body: await deps.githubStatus() }
    }
    if (path === '/v1/github/token' && method === 'POST') {
      const body = parseBody(req.bodyText)
      const token = typeof body.token === 'string' ? body.token : ''
      const result = await deps.githubConnect(token)
      return { status: 200, body: { login: result.login, connected: true } }
    }
    if (path === '/v1/github/token' && method === 'DELETE') {
      await deps.githubDisconnect()
      return { status: 200, body: { connected: false, login: null } }
    }
    if (path === '/v1/github/repo' && method === 'GET') {
      const link = repoFromQuery(req.query)
      const token = await deps.githubToken()
      const info = await githubRepo(link, token)
      return { status: 200, body: info }
    }
    if (path === '/v1/github/commits' && method === 'GET') {
      const link = repoFromQuery(req.query)
      const token = await deps.githubToken()
      return { status: 200, body: { items: await githubCommits(link, token) } }
    }
    if (path === '/v1/github/pulls' && method === 'GET') {
      const link = repoFromQuery(req.query)
      const token = await deps.githubToken()
      return { status: 200, body: { items: await githubPulls(link, token) } }
    }

    const parts = path.split('/').filter(Boolean)
    if (parts[0] !== 'v1' || parts.length < 2 || parts.length > 3) {
      return jsonError(404, 'not_found', 'Маршрут не найден')
    }
    const collection = parts[1] ?? ''
    const id = parts[2]

    if (!id && method === 'GET') {
      const items = await deps.api.list(collection)
      return { status: 200, body: { items } }
    }
    if (!id && method === 'POST') {
      const created = await deps.api.create(collection, parseBody(req.bodyText))
      return { status: 201, body: created }
    }
    if (id && method === 'GET') {
      return { status: 200, body: await deps.api.get(collection, id) }
    }
    if (id && method === 'PATCH') {
      return { status: 200, body: await deps.api.patch(collection, id, parseBody(req.bodyText), 'patch') }
    }
    if (id && method === 'PUT') {
      return { status: 200, body: await deps.api.patch(collection, id, parseBody(req.bodyText), 'replace') }
    }
    if (id && method === 'DELETE') {
      await deps.api.remove(collection, id)
      return { status: 200, body: { ok: true } }
    }
    return jsonError(405, 'method_not_allowed', 'Метод не поддерживается')
  } catch (error) {
    if (error instanceof GithubError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502
      return jsonError(status, 'github', error.message)
    }
    if (isApiError(error) || error instanceof Error) {
      const api = toApiError(error)
      return jsonError(api.status, api.code, api.message)
    }
    return jsonError(500, 'internal', 'Внутренняя ошибка')
  }
}

export class SlidingLimiter {
  private hits: number[] = []
  private readonly limit: number
  private readonly windowMs: number

  constructor(limit = 60, windowMs = 10_000) {
    this.limit = limit
    this.windowMs = windowMs
  }

  allow(now = Date.now()): boolean {
    const cutoff = now - this.windowMs
    this.hits = this.hits.filter((stamp) => stamp >= cutoff)
    if (this.hits.length >= this.limit) return false
    this.hits.push(now)
    return true
  }
}
