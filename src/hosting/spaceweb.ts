/**
 * Клиент Spaceweb (JSON-RPC). Разрешены только чтение VPS, питание и журнал
 * операций хостера. Удаление, переустановка, смена тарифа и бэкапы не вызываются:
 * список ниже — allowlist, всё остальное отклоняется.
 */

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  method: string
  params: Record<string, unknown>
  id: string
}

/** Транспорт без сети: класс, тело JSON-RPC и токен (null только у getToken). */
export type RpcTransport = (
  className: string,
  body: JsonRpcRequest,
  token: string | null,
) => Promise<unknown>

export type TokenProvider = () => Promise<string>

export type SpacewebPowerAction = 'on' | 'off' | 'reboot'

export type SpacewebVps = {
  billingId: string
  name: string
  planName: string
  /** Число процессоров из поля cpu, не процент загрузки. */
  cpu: number | null
  ram: string
  disk: string
  os: string
  ip: string
  mac: string
  running: boolean
  currentAction: string
  createdAt: string
}

/** Журнал операций хостера (старт, стоп и т.п.), не бэкапы Loomixx. */
export type SpacewebOperationLog = {
  type: string
  status: string
  startedAt: string
  endedAt: string
}

/** Совпадает с текстом Rust-команды hosting_request при HTTP 401. */
export const SPACEWEB_AUTH_DENIED = 'Spaceweb отклонил авторизацию'

const TEXT_LIMIT = 120
const LOG_LIMIT = 50
const MESSAGE_LIMIT = 200
const BILLING_ID = /^[A-Za-z0-9_-]{1,80}$/

const ALLOWED: Readonly<Record<string, ReadonlySet<string>>> = {
  vps: new Set(['index', 'isRunning', 'getCurrentAction', 'powerOn', 'powerOff', 'reboot', 'logs']),
  'vps/ip': new Set(['index', 'getAllIpList']),
}

const POWER_METHOD: Readonly<Record<SpacewebPowerAction, string>> = {
  on: 'powerOn',
  off: 'powerOff',
  reboot: 'reboot',
}

export class SpacewebError extends Error {
  readonly status: number
  readonly auth: boolean

  constructor(message: string, status = 0, auth = false) {
    super(message)
    this.name = 'SpacewebError'
    this.status = status
    this.auth = auth
  }
}

export function spacewebAllowed(className: string, method: string): boolean {
  return ALLOWED[className]?.has(method) ?? false
}

export function buildRpc(method: string, params: Record<string, unknown> = {}): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id: crypto.randomUUID(),
  }
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function sanitizeMessage(message: string, secrets: readonly string[]): string {
  let out = ''
  for (const char of message) {
    const code = char.charCodeAt(0)
    out += code <= 0x1f || code === 0x7f ? ' ' : char
  }
  out = out.replace(/\s+/g, ' ').trim()
  for (const secret of secrets) {
    if (secret.length >= 4) out = out.split(secret).join('')
  }
  out = out.replace(/bearer\s+\S+/gi, '').replace(/\s+/g, ' ').trim()
  if (out.length > MESSAGE_LIMIT) out = out.slice(0, MESSAGE_LIMIT).trim()
  return out
}

function readErrorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

export function toSpacewebError(error: unknown, secrets: readonly string[] = []): SpacewebError {
  if (error instanceof SpacewebError) {
    if (error.auth) return new SpacewebError(SPACEWEB_AUTH_DENIED, 401, true)
    const message = sanitizeMessage(error.message, secrets) || 'Spaceweb вернул ошибку'
    return new SpacewebError(message, error.status, false)
  }
  const raw = readErrorText(error)
  if (raw === SPACEWEB_AUTH_DENIED || raw.includes(SPACEWEB_AUTH_DENIED)) {
    return new SpacewebError(SPACEWEB_AUTH_DENIED, 401, true)
  }
  const clean = sanitizeMessage(raw, secrets)
  if (/двухфактор/i.test(clean)) {
    return new SpacewebError('Для Spaceweb нужен код двухфакторной аутентификации')
  }
  return new SpacewebError(clean || 'Нет соединения со Spaceweb')
}

function rpcFailure(error: unknown, secrets: readonly string[]): SpacewebError {
  let code: number | null = null
  let message = ''
  if (typeof error === 'object' && error && !Array.isArray(error)) {
    const rec = error as { code?: unknown; message?: unknown }
    if (typeof rec.code === 'number' && Number.isFinite(rec.code)) code = rec.code
    if (typeof rec.message === 'string') message = rec.message
  } else if (typeof error === 'string') {
    message = error
  }
  if (code === -32401 || /двухфактор|2fa/i.test(message)) {
    return new SpacewebError('Для Spaceweb нужен код двухфакторной аутентификации')
  }
  const clean = sanitizeMessage(message, secrets)
  if (code === 401 || /unauthorized|invalid token|token expired|авторизац/i.test(clean)) {
    return new SpacewebError(SPACEWEB_AUTH_DENIED, 401, true)
  }
  return new SpacewebError(clean || 'Spaceweb вернул ошибку')
}

/** Достаёт result из конверта JSON-RPC. Тело ответа в текст ошибки не попадает. */
export function unwrapRpc(payload: unknown, secrets: readonly string[] = []): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SpacewebError('Spaceweb вернул неожиданный ответ')
  }
  const row = payload as { result?: unknown; error?: unknown }
  if (row.error != null) throw rpcFailure(row.error, secrets)
  if (!('result' in row)) throw new SpacewebError('Spaceweb вернул ответ без результата')
  return row.result
}

function acceptToken(value: string): string | null {
  const token = value.trim()
  if (token.length < 8 || token.length > 400) return null
  if (hasControlChar(token) || /\s/.test(token) || token.includes('://')) return null
  return token
}

/**
 * Документированный result — строка токена.
 * Если пришёл объект, берём поле token и отвергаем любой другой вид.
 */
export function parseTokenResult(result: unknown): string {
  if (typeof result === 'string') {
    const token = acceptToken(result)
    if (token) return token
  } else if (result && typeof result === 'object' && !Array.isArray(result)) {
    const token = acceptToken(typeof (result as { token?: unknown }).token === 'string'
      ? (result as { token: string }).token
      : '')
    if (token) return token
  }
  throw new SpacewebError('Spaceweb не вернул токен')
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim().slice(0, TEXT_LIMIT)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, TEXT_LIMIT)
  return ''
}

function parseCpu(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) return Number(value.trim())
  return null
}

function parseRunning(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

export function parseVpsList(result: unknown): SpacewebVps[] {
  if (!Array.isArray(result)) return []
  const out: SpacewebVps[] = []
  for (const row of result) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const billingId = typeof rec.billingId === 'string' ? rec.billingId.trim() : ''
    if (!BILLING_ID.test(billingId)) continue
    out.push({
      billingId,
      name: text(rec.name),
      planName: text(rec.plan_name),
      cpu: parseCpu(rec.cpu),
      ram: text(rec.ram),
      disk: text(rec.disk),
      os: text(rec.os_distribution),
      ip: text(rec.ip),
      mac: text(rec.mac),
      running: parseRunning(rec.is_running),
      currentAction: text(rec.current_action),
      createdAt: text(rec.ts_create),
    })
  }
  return out
}

export function parsePowerResult(result: unknown): boolean {
  if (result === 1 || result === true || result === '1') return true
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false
  const rec = result as { code?: unknown; extendedResult?: { code?: unknown } }
  const code = rec.code ?? rec.extendedResult?.code
  return code === 1 || code === true || code === '1'
}

function logText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, TEXT_LIMIT)
}

export function parseOperationLogs(result: unknown): SpacewebOperationLog[] {
  if (!Array.isArray(result)) return []
  const out: SpacewebOperationLog[] = []
  for (const row of result) {
    if (out.length >= LOG_LIMIT) break
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const started = rec.started_at ?? rec.startedAt
    const ended = rec.ended_at ?? rec.endedAt
    out.push({
      type: logText(rec.type),
      status: logText(rec.status),
      startedAt: logText(started),
      endedAt: logText(ended),
    })
  }
  return out
}

function assertBillingId(value: string): string {
  const id = value.trim()
  if (!BILLING_ID.test(id)) throw new SpacewebError('Некорректный идентификатор VPS')
  return id
}

export class SpacewebClient {
  private readonly transport: RpcTransport
  private readonly tokenProvider: TokenProvider
  private readonly dropToken: () => void

  constructor(transport: RpcTransport, tokenProvider: TokenProvider, dropToken: () => void = () => undefined) {
    this.transport = transport
    this.tokenProvider = tokenProvider
    this.dropToken = dropToken
  }

  async listVps(): Promise<SpacewebVps[]> {
    const result = await this.call('vps', 'index', {})
    return parseVpsList(result)
  }

  async power(billingId: string, action: SpacewebPowerAction): Promise<boolean> {
    const id = assertBillingId(billingId)
    const method = POWER_METHOD[action]
    if (!method || !spacewebAllowed('vps', method)) throw new SpacewebError('Метод Spaceweb не разрешён')
    const result = await this.call('vps', method, { billingId: id })
    return parsePowerResult(result)
  }

  async logs(billingId: string): Promise<SpacewebOperationLog[]> {
    const id = assertBillingId(billingId)
    const result = await this.call('vps', 'logs', { billingId: id })
    return parseOperationLogs(result)
  }

  private async call(className: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!spacewebAllowed(className, method)) throw new SpacewebError('Метод Spaceweb не разрешён')
    return this.attempt(className, method, params, false)
  }

  /** Одна повторная попытка после 401: сбросить кэш и взять новый токен из пароля. */
  private async attempt(
    className: string,
    method: string,
    params: Record<string, unknown>,
    retried: boolean,
  ): Promise<unknown> {
    const token = await this.tokenProvider()
    const body = buildRpc(method, params)
    try {
      const payload = await this.transport(className, body, token)
      return unwrapRpc(payload, [token])
    } catch (error) {
      const wrapped = toSpacewebError(error, [token])
      if (retried || !wrapped.auth) throw wrapped
      this.dropToken()
      return this.attempt(className, method, params, true)
    }
  }
}
