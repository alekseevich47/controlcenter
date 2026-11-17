/**
 * Сеть Spaceweb: в Tauri — команды hosting_get_token / hosting_request,
 * в браузерном dev-сервере — прокси `/sweb` → api.sweb.ru.
 *
 * Экран серверов вызывает так (VaultContext уже зарегистрировал читателя):
 *   const client = await getSpacewebClient()
 *   if (!client) return
 *   const list = await client.listVps()
 *   await client.power(id, 'on' | 'off' | 'reboot')
 *   const journal = await client.logs(id)
 */
import { isTauri } from '../vault/runtime'
import { clearSpacewebToken, getSpacewebToken, setSpacewebToken } from './session'
import {
  SpacewebClient,
  SpacewebError,
  buildRpc,
  parseTokenResult,
  spacewebAllowed,
  toSpacewebError,
  unwrapRpc,
  type JsonRpcRequest,
  type RpcTransport,
  type TokenProvider,
} from './spaceweb'

const TIMEOUT_MS = 20_000
const TOKEN_URL = '/sweb/notAuthorized/'

const DEV_CLASS_URL: Readonly<Record<string, string>> = {
  vps: '/sweb/vps',
  'vps/ip': '/sweb/vps/ip',
}

export type SpacewebAuthReader = () => Promise<{ login: string; password: string } | null>

let readAuth: SpacewebAuthReader = async () => null

export function bindSpacewebAuth(reader: SpacewebAuthReader): void {
  readAuth = reader
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function assertLogin(login: string): string {
  const clean = login.trim()
  if (!clean || clean.length > 80 || hasControlChar(clean)) {
    throw new SpacewebError('Укажите логин Spaceweb')
  }
  return clean
}

function assertPassword(password: string): void {
  if (!password || password.length > 200 || hasControlChar(password)) {
    throw new SpacewebError('Укажите пароль Spaceweb')
  }
}

async function readResponse(res: Response, secrets: readonly string[], authOn401: boolean): Promise<unknown> {
  if (res.type === 'opaqueredirect' || res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
    await res.body?.cancel().catch(() => undefined)
    throw new SpacewebError('Spaceweb прислал перенаправление')
  }
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined)
    if (authOn401) throw new SpacewebError('Spaceweb отклонил авторизацию', 401, true)
    throw new SpacewebError('Spaceweb отклонил логин или пароль', 401, false)
  }
  let text = ''
  try {
    text = await res.text()
  } catch {
    throw new SpacewebError('Spaceweb не ответил')
  }
  if (text.length > 1_048_576) throw new SpacewebError('Слишком большой ответ Spaceweb')
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = null
    }
  }
  if (!res.ok) {
    if (payload && typeof payload === 'object') {
      try {
        unwrapRpc(payload, secrets)
      } catch (error) {
        throw toSpacewebError(error, secrets)
      }
    }
    throw new SpacewebError(`Spaceweb ответил ошибкой ${res.status}`)
  }
  if (payload == null) throw new SpacewebError('Spaceweb вернул некорректный ответ')
  return payload
}

async function postJson(
  url: string,
  body: JsonRpcRequest,
  token: string | null,
  secrets: readonly string[],
  authOn401: boolean,
): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'manual',
        signal: ctrl.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SpacewebError('Spaceweb не ответил вовремя')
      }
      throw new SpacewebError('Нет соединения со Spaceweb')
    }
    return await readResponse(res, secrets, authOn401)
  } finally {
    clearTimeout(timer)
  }
}

async function browserGetToken(login: string, password: string): Promise<unknown> {
  if (!import.meta.env.DEV) {
    throw new SpacewebError('Spaceweb в браузере доступен только через dev-сервер')
  }
  return postJson(TOKEN_URL, buildRpc('getToken', { login, password }), null, [password], false)
}

async function browserTransport(className: string, body: JsonRpcRequest, token: string | null): Promise<unknown> {
  if (!import.meta.env.DEV) {
    throw new SpacewebError('Spaceweb в браузере доступен только через dev-сервер')
  }
  if (!token) throw new SpacewebError('Нет токена Spaceweb')
  if (!spacewebAllowed(className, body.method)) throw new SpacewebError('Метод Spaceweb не разрешён')
  const url = DEV_CLASS_URL[className]
  if (!url) throw new SpacewebError('Класс Spaceweb не разрешён')
  return postJson(url, body, token, [token], true)
}

async function tauriGetToken(login: string, password: string): Promise<unknown> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<unknown>('hosting_get_token', { login, password })
  } catch (error) {
    throw toSpacewebError(error, [password])
  }
}

async function tauriTransport(className: string, body: JsonRpcRequest, token: string | null): Promise<unknown> {
  if (!token) throw new SpacewebError('Нет токена Spaceweb')
  if (!spacewebAllowed(className, body.method)) throw new SpacewebError('Метод Spaceweb не разрешён')
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<unknown>('hosting_request', { className, body, token })
  } catch (error) {
    throw toSpacewebError(error, [token])
  }
}

const liveTransport: RpcTransport = (className, body, token) =>
  isTauri() ? tauriTransport(className, body, token) : browserTransport(className, body, token)

/** getToken. Пароль уходит только в hosting_get_token или на фиксированный /sweb/notAuthorized/. */
export async function fetchSpacewebToken(login: string, password: string): Promise<string> {
  const cleanLogin = assertLogin(login)
  assertPassword(password)
  const payload = isTauri()
    ? await tauriGetToken(cleanLogin, password)
    : await browserGetToken(cleanLogin, password)
  return parseTokenResult(unwrapRpc(payload, [password]))
}

const provideToken: TokenProvider = async () => {
  const cached = getSpacewebToken()
  if (cached) return cached
  const auth = await readAuth()
  if (!auth?.login || !auth.password) throw new SpacewebError('Кабинет Spaceweb не подключён')
  const token = await fetchSpacewebToken(auth.login, auth.password)
  const still = await readAuth()
  if (!still?.password || still.login !== auth.login) {
    clearSpacewebToken()
    throw new SpacewebError('Кабинет Spaceweb не подключён')
  }
  setSpacewebToken(token)
  if (!(await readAuth())?.password) {
    clearSpacewebToken()
    throw new SpacewebError('Кабинет Spaceweb не подключён')
  }
  return token
}

export async function getSpacewebClient(): Promise<SpacewebClient | null> {
  let auth: { login: string; password: string } | null
  try {
    auth = await readAuth()
  } catch {
    clearSpacewebToken()
    return null
  }
  if (!auth?.login || !auth.password) {
    clearSpacewebToken()
    return null
  }
  return new SpacewebClient(liveTransport, provideToken, clearSpacewebToken)
}
