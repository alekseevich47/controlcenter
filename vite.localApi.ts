import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const MAX_BODY = 65_536
const API_WAIT_MS = 8_000
const BRIDGE_WAIT_MS = 20_000
const MAX_QUEUE = 8

type Job = {
  id: string
  method: string
  path: string
  query: string
  body: string
  bearer: string | null
  finish: (status: number, body: string) => void
}

function secretOk(header: string | string[] | undefined, secret: string): boolean {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) return false
  const a = Buffer.from(raw)
  const b = Buffer.from(secret)
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function send(res: ServerResponse, status: number, body: string): void {
  const buf = Buffer.from(body)
  if (res.writableEnded) return
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(buf.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Connection: 'close',
  })
  res.end(buf)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readBearer(req: IncomingMessage): string | null {
  const raw = req.headers.authorization
  if (typeof raw !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim())
  return match?.[1] ?? null
}

/**
 * Dev-only loopback API.
 * Браузер (vault) забирает запросы long-poll'ом и отвечает тем же диспетчером, что и desktop.
 * Слушает только вместе с Vite на 127.0.0.1.
 */
export function lccLocalApiPlugin(): Plugin {
  const bridgeSecret = randomBytes(24).toString('hex')
  const queue: Job[] = []
  const inflight = new Map<string, Job>()
  let waiter: ((job: Job) => void) | null = null

  function enqueue(job: Job): void {
    if (waiter) {
      const next = waiter
      waiter = null
      inflight.set(job.id, job)
      next(job)
      return
    }
    if (queue.length >= MAX_QUEUE) {
      job.finish(429, JSON.stringify({ error: 'busy', message: 'Очередь локального API переполнена' }))
      return
    }
    queue.push(job)
  }

  function take(): Promise<Job | null> {
    const existing = queue.shift()
    if (existing) {
      inflight.set(existing.id, existing)
      return Promise.resolve(existing)
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (waiter) waiter = null
        resolve(null)
      }, BRIDGE_WAIT_MS)
      waiter = (job) => {
        clearTimeout(timer)
        resolve(job)
      }
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!isLoopback(req)) {
      send(res, 403, JSON.stringify({ error: 'forbidden', message: 'Только 127.0.0.1' }))
      return true
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    if (path.startsWith('/__lcc_bridge/')) {
      if (!secretOk(req.headers['x-lcc-bridge'], bridgeSecret)) {
        send(res, 404, JSON.stringify({ error: 'not_found' }))
        return true
      }
      if (path === '/__lcc_bridge/next' && req.method === 'GET') {
        const job = await take()
        if (!job) {
          res.statusCode = 204
          res.setHeader('Cache-Control', 'no-store')
          res.end()
          return true
        }
        send(
          res,
          200,
          JSON.stringify({
            id: job.id,
            method: job.method,
            path: job.path,
            query: job.query,
            body: job.body,
            bearer: job.bearer,
          }),
        )
        return true
      }
      if (path === '/__lcc_bridge/result' && req.method === 'POST') {
        let text = ''
        try {
          text = await readBody(req)
        } catch {
          send(res, 413, JSON.stringify({ error: 'too_large' }))
          return true
        }
        let payload: { id?: unknown; status?: unknown; body?: unknown }
        try {
          payload = JSON.parse(text) as { id?: unknown; status?: unknown; body?: unknown }
        } catch {
          send(res, 400, JSON.stringify({ error: 'validation' }))
          return true
        }
        const id = typeof payload.id === 'string' ? payload.id : ''
        const job = inflight.get(id)
        if (!job) {
          send(res, 404, JSON.stringify({ error: 'not_found' }))
          return true
        }
        inflight.delete(id)
        const status = typeof payload.status === 'number' ? payload.status : 500
        const body = typeof payload.body === 'string' ? payload.body.slice(0, MAX_BODY) : '{}'
        job.finish(status, body)
        send(res, 204, '')
        return true
      }
      send(res, 404, JSON.stringify({ error: 'not_found' }))
      return true
    }

    if (path !== '/v1' && !path.startsWith('/v1/')) return false

    let body = ''
    try {
      body = await readBody(req)
    } catch {
      send(res, 413, JSON.stringify({ error: 'too_large', message: 'Тело больше 64 КБ' }))
      return true
    }

    const id = randomUUID()
    const outcome = await new Promise<{ status: number; body: string }>((resolve) => {
      const timer = setTimeout(() => {
        inflight.delete(id)
        resolve({
          status: 503,
          body: JSON.stringify({
            error: 'unavailable',
            message: 'LCC не ответил. Откройте приложение и включите локальный API в настройках.',
          }),
        })
      }, API_WAIT_MS)
      const job: Job = {
        id,
        method: req.method ?? 'GET',
        path,
        query: url.searchParams.toString(),
        body,
        bearer: readBearer(req),
        finish: (status, payload) => {
          clearTimeout(timer)
          inflight.delete(id)
          resolve({ status, body: payload })
        },
      }
      enqueue(job)
    })
    send(res, outcome.status, outcome.body || '{}')
    return true
  }

  return {
    name: 'lcc-local-api',
    config(_config, env) {
      if (env.command !== 'serve') {
        return { define: { __LCC_BRIDGE_SECRET__: JSON.stringify('') } }
      }
      return { define: { __LCC_BRIDGE_SECRET__: JSON.stringify(bridgeSecret) } }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res)
          .then((consumed) => {
            if (!consumed) next()
          })
          .catch(() => {
            if (!res.writableEnded) {
              send(res, 500, JSON.stringify({ error: 'internal', message: 'Сбой локального API' }))
            }
          })
      })
    },
  }
}
