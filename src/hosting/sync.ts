/**
 * Опрос списка VPS для экранов серверов.
 * Только listVps: без vps.load и без методов бэкапа.
 * В vault пишем сервер, когда изменился паспорт, и проставляем checkedAt.
 * Сам факт опроса в карточку попадает через состояние, без записи.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../components/ToastProvider'
import { normalizeServer } from '../vault/serverModel'
import type { Server, ServerHostSnapshot, ServerStatusKind } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'
import { getSpacewebClient } from './runtime'
import type { SpacewebVps } from './spaceweb'

const POLL_MS = 60_000
const BACKOFF_MS = 120_000

const LIMIT = {
  ip: 64,
  os: 80,
  plan: 120,
  location: 80,
  mac: 32,
  action: 80,
  status: 40,
  specs: 200,
} as const

export type SpacewebRosterPhase = 'off' | 'loading' | 'ready' | 'error'

export type SpacewebRoster = {
  vps: readonly SpacewebVps[]
  checkedAt: string | null
  phase: SpacewebRosterPhase
  refresh: () => void
}

type GetServer = (collection: 'servers', id: string) => Promise<Server | null>
type PutServer = (collection: 'servers', entity: Server) => Promise<void>

let listTail: Promise<unknown> = Promise.resolve()

/** Один listVps за раз, в том числе между повторным mount в StrictMode. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = listTail.then(task, task)
  listTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function clip(value: string, max: number): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim().slice(0, max)
}

function filled(value: string, max: number): string | undefined {
  const next = clip(value, max)
  return next || undefined
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, ' ').trim()
    if (message) return message.slice(0, 200)
  }
  return 'Нет соединения со Spaceweb'
}

/** Строка тарифа из cpu/ram/disk как их отдал API, без выдуманных процентов. */
export function tariffSpecs(vps: SpacewebVps): string | undefined {
  if (vps.cpu == null || !Number.isFinite(vps.cpu) || vps.cpu <= 0) return undefined
  const ram = vps.ram.trim()
  const disk = vps.disk.trim()
  if (!ram || !disk) return undefined
  const cpu = Number.isInteger(vps.cpu) ? String(vps.cpu) : String(Math.round(vps.cpu * 10) / 10)
  return filled(`${cpu} vCPU · ${ram} · ${disk}`, LIMIT.specs)
}

export function statusFromHost(vps: Pick<SpacewebVps, 'running' | 'currentAction'>): {
  status: string
  statusKind: ServerStatusKind
} {
  const action = filled(vps.currentAction, LIMIT.status)
  if (action) return { status: action, statusKind: 'amber' }
  if (vps.running) return { status: 'Online', statusKind: 'green' }
  return { status: 'Offline', statusKind: 'red' }
}

function snapshotFrom(server: Server, vps: SpacewebVps, checkedAt: string | undefined): ServerHostSnapshot {
  const prev = server.hostSnapshot
  const snap: ServerHostSnapshot = {}
  const ip = filled(vps.ip, LIMIT.ip) ?? prev?.ip
  const os = filled(vps.os, LIMIT.os) ?? prev?.os
  const plan = filled(vps.planName, LIMIT.plan) ?? prev?.plan
  const location = prev?.location ? filled(prev.location, LIMIT.location) : undefined
  const mac = filled(vps.mac, LIMIT.mac) ?? prev?.mac
  const action = filled(vps.currentAction, LIMIT.action)
  if (ip) snap.ip = ip
  if (os) snap.os = os
  if (plan) snap.plan = plan
  if (location) snap.location = location
  if (mac) snap.mac = mac
  snap.isRunning = vps.running
  if (action) snap.currentAction = action
  if (checkedAt) snap.checkedAt = checkedAt
  return snap
}

/** Паспорт для записи. Локацию API не присылает — уже записанную не стираем. */
export function withSpacewebVps(server: Server, vps: SpacewebVps, checkedAt: string): Server {
  const status = statusFromHost(vps)
  const specs = tariffSpecs(vps)
  return {
    ...server,
    status: status.status,
    statusKind: status.statusKind,
    specs: specs ?? server.specs,
    provider: { kind: 'spaceweb', billingId: vps.billingId },
    hostSnapshot: snapshotFrom(server, vps, checkedAt),
    updatedAt: checkedAt,
  }
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') === (b ?? '')
}

/**
 * checkedAt сюда не входит: тихий опрос не должен переписывать vault.
 * Статус и строка тарифа входят, чтобы бейдж и ресурсы догнали снимок один раз.
 */
function sameHost(server: Server, vps: SpacewebVps): boolean {
  const next = snapshotFrom(server, vps, undefined)
  const prev = server.hostSnapshot
  const specs = tariffSpecs(vps)
  const status = statusFromHost(vps)
  return (
    sameText(prev?.ip, next.ip) &&
    sameText(prev?.os, next.os) &&
    sameText(prev?.plan, next.plan) &&
    sameText(prev?.location, next.location) &&
    sameText(prev?.mac, next.mac) &&
    (prev?.isRunning ?? null) === (next.isRunning ?? null) &&
    sameText(prev?.currentAction, next.currentAction) &&
    server.status === status.status &&
    server.statusKind === status.statusKind &&
    (specs == null || server.specs === specs)
  )
}

async function persistLinked(
  list: readonly SpacewebVps[],
  checkedAt: string,
  servers: readonly Server[],
  get: GetServer,
  put: PutServer,
): Promise<void> {
  for (const server of servers) {
    if (server.provider?.kind !== 'spaceweb') continue
    const row = list.find((item) => item.billingId === server.provider?.billingId)
    if (!row || sameHost(server, row)) continue
    const fresh = await get('servers', server.id)
    if (!fresh || fresh.provider?.kind !== 'spaceweb') continue
    if (fresh.provider.billingId !== row.billingId) continue
    if (sameHost(fresh, row)) continue
    await put('servers', normalizeServer(withSpacewebVps(fresh, row, checkedAt)))
  }
}

/**
 * Живой паспорт для карточки. Статус сущности не подменяется:
 * питание не рисует Offline, пока хостер сам не подтвердил действие.
 */
export function presentServer(server: Server, list: readonly SpacewebVps[], polledAt: string | null): Server {
  if (server.provider?.kind !== 'spaceweb') return server
  const row = list.find((item) => item.billingId === server.provider?.billingId)
  if (!row && !polledAt) return server
  if (!row) {
    return {
      ...server,
      hostSnapshot: {
        ...server.hostSnapshot,
        checkedAt: polledAt ?? server.hostSnapshot?.checkedAt,
      },
    }
  }
  const specs = tariffSpecs(row)
  return {
    ...server,
    specs: specs ?? server.specs,
    hostSnapshot: snapshotFrom(server, row, polledAt ?? undefined),
  }
}

export function vpsOptionLabel(vps: SpacewebVps): string {
  const name = vps.name.trim() || 'VPS'
  const ip = vps.ip.trim() || 'без IP'
  return `${name} · ${ip}`
}

export function useSpacewebRoster(): SpacewebRoster {
  const { spacewebLogin, get, put } = useVault()
  const { items } = useCollection('servers')
  const { notify } = useToast()
  const [vps, setVps] = useState<SpacewebVps[]>([])
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [phase, setPhase] = useState<SpacewebRosterPhase>('off')
  const loginKey = spacewebLogin ?? ''
  const [seenLogin, setSeenLogin] = useState(loginKey)
  if (seenLogin !== loginKey) {
    setSeenLogin(loginKey)
    setVps([])
    setCheckedAt(null)
    setPhase(loginKey ? 'loading' : 'off')
  }

  const itemsRef = useRef(items)
  const getRef = useRef(get)
  const putRef = useRef(put)
  const notifyRef = useRef(notify)
  const refreshRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    itemsRef.current = items
    getRef.current = get
    putRef.current = put
    notifyRef.current = notify
  }, [items, get, put, notify])

  useEffect(() => {
    if (!spacewebLogin) {
      refreshRef.current = () => undefined
      return
    }

    let cancelled = false
    let timer = 0
    let running = false
    let pending = false
    let announce = true

    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      if (cancelled || document.hidden) return
      timer = window.setTimeout(() => {
        pending = true
        kick()
      }, delay)
    }

    const kick = () => {
      if (cancelled) return
      if (document.hidden) {
        pending = true
        return
      }
      if (running) {
        pending = true
        return
      }
      running = true
      pending = false
      void enqueue(() => pull())
        .then((delay) => {
          running = false
          if (cancelled) return
          if (pending) {
            pending = false
            kick()
            return
          }
          schedule(delay)
        })
        .catch(() => {
          running = false
          if (cancelled) return
          if (announce) {
            announce = false
            notifyRef.current({ message: 'Нет соединения со Spaceweb', tone: 'danger' })
          }
          setPhase((prev) => (prev === 'ready' ? 'ready' : 'error'))
          if (pending) {
            pending = false
            kick()
            return
          }
          schedule(BACKOFF_MS)
        })
    }

    const pull = async (): Promise<number> => {
      if (cancelled || document.hidden) return POLL_MS
      try {
        const client = await getSpacewebClient()
        if (cancelled) return POLL_MS
        if (!client) {
          if (announce) {
            announce = false
            notifyRef.current({ message: 'Кабинет Spaceweb не подключён', tone: 'danger' })
          }
          setPhase((prev) => (prev === 'ready' ? 'ready' : 'error'))
          return BACKOFF_MS
        }
        const list = await client.listVps()
        if (cancelled) return POLL_MS
        const now = new Date().toISOString()
        setVps(list)
        setCheckedAt(now)
        setPhase('ready')
        announce = false
        try {
          await persistLinked(list, now, itemsRef.current, getRef.current, putRef.current)
        } catch {
          // Список уже на экране. Следующий опрос повторит запись.
        }
        return POLL_MS
      } catch (error) {
        if (!cancelled && announce) {
          announce = false
          notifyRef.current({ message: errorText(error), tone: 'danger' })
        }
        if (!cancelled) setPhase((prev) => (prev === 'ready' ? 'ready' : 'error'))
        return BACKOFF_MS
      }
    }

    const requestNow = () => {
      window.clearTimeout(timer)
      pending = true
      kick()
    }

    const onVisible = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        return
      }
      requestNow()
    }

    refreshRef.current = requestNow
    document.addEventListener('visibilitychange', onVisible)
    if (!document.hidden) requestNow()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      refreshRef.current = () => undefined
    }
  }, [spacewebLogin])

  const refresh = useCallback(() => {
    refreshRef.current()
  }, [])

  return { vps, checkedAt, phase, refresh }
}
