import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { applyAppUpdate } from './apply'
import {
  clearPendingUpdate,
  readPendingUpdate,
  writePendingUpdate,
  type PendingUpdate,
} from './pending'
import {
  getDownloadSnapshot,
  subscribeDownload,
  type DownloadSnapshot,
} from './releaseDownload'
import { fetchRemoteRelease } from './remote'
import { isNewerVersion } from './semver'
import { APP_VERSION } from '../version'

export type UpdateCheckResult = {
  status: 'available' | 'current' | 'error'
  update?: PendingUpdate
  message?: string
}

export type ApplyUpdateResult = {
  ok: boolean
  message: string
}

type UpdateContextValue = {
  available: PendingUpdate | null
  checking: boolean
  applying: boolean
  /** Снимок загрузки релиза. Живёт в провайдере, не на странице. */
  download: DownloadSnapshot
  /** Время удачной проверки, которая не нашла более новую версию. */
  lastCheckedAt: string | null
  offerOpen: boolean
  openOffer: () => void
  closeOffer: () => void
  checkNow: () => Promise<UpdateCheckResult>
  applyNow: () => Promise<ApplyUpdateResult>
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

const ABORT_MESSAGE = 'Проверка прервана'

type ReleaseFields = {
  version: string
  build: string
  title: string
  highlights: readonly string[]
}

type Inflight = {
  controller: AbortController
  promise: Promise<UpdateCheckResult>
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : err instanceof Error && err.name === 'AbortError'
}

function errorText(err: unknown, fallback: string): string {
  if (isAbortError(err)) return ABORT_MESSAGE
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message &&
      message !== 'Failed to fetch' &&
      message !== 'Load failed' &&
      message !== 'NetworkError when attempting to fetch resource.'
    ) {
      return message
    }
  }
  return fallback
}

function readInitialPending(): PendingUpdate | null {
  try {
    const stored = readPendingUpdate()
    if (!stored?.version) return null
    if (!isNewerVersion(stored.version, APP_VERSION)) return null
    return stored
  } catch {
    return null
  }
}

function toPending(remote: ReleaseFields): PendingUpdate {
  return {
    version: remote.version,
    build: remote.build,
    title: remote.title,
    highlights: [...remote.highlights],
    checkedAt: new Date().toISOString(),
  }
}

function aborted(): UpdateCheckResult {
  return { status: 'error', message: ABORT_MESSAGE }
}

/**
 * Проверка релиза живёт выше замка vault: тихий запрос идёт до разблокировки,
 * а сохранённое обновление сразу попадает в кнопку.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState<PendingUpdate | null>(readInitialPending)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [download, setDownload] = useState<DownloadSnapshot>(() => getDownloadSnapshot())
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)

  const inflight = useRef<Inflight | null>(null)
  const applyTask = useRef<Promise<ApplyUpdateResult> | null>(null)
  const epoch = useRef(0)
  const mounted = useRef(true)

  const perform = useCallback(async (signal: AbortSignal, ticket: number): Promise<UpdateCheckResult> => {
    try {
      const remote = await fetchRemoteRelease(APP_VERSION, signal)
      if (signal.aborted || ticket !== epoch.current) return aborted()
      if (isNewerVersion(remote.version, APP_VERSION)) {
        if (signal.aborted || ticket !== epoch.current) return aborted()
        const update = toPending(remote)
        writePendingUpdate(update)
        if (signal.aborted || ticket !== epoch.current) return aborted()
        const stored = readPendingUpdate()
        const visible = stored?.version === update.version ? stored : update
        setAvailable(visible)
        return { status: 'available', update: visible }
      }
      if (signal.aborted || ticket !== epoch.current) return aborted()
      clearPendingUpdate()
      setAvailable(null)
      setOfferOpen(false)
      setLastCheckedAt(new Date().toISOString())
      return { status: 'current' }
    } catch (err) {
      if (signal.aborted || ticket !== epoch.current || isAbortError(err)) return aborted()
      return { status: 'error', message: errorText(err, 'Не удалось проверить обновления') }
    }
  }, [])

  const startCheck = useCallback((): Promise<UpdateCheckResult> => {
    if (inflight.current) return inflight.current.promise
    const controller = new AbortController()
    const ticket = epoch.current
    const promise = perform(controller.signal, ticket).finally(() => {
      if (inflight.current?.controller === controller) inflight.current = null
    })
    inflight.current = { controller, promise }
    return promise
  }, [perform])

  useEffect(() => {
    mounted.current = true
    try {
      const stored = readPendingUpdate()
      if (stored && !isNewerVersion(stored.version, APP_VERSION)) clearPendingUpdate()
    } catch {
      // битая запись уже не попадает в кнопку
    }
    void startCheck()
    return () => {
      mounted.current = false
      epoch.current += 1
      inflight.current?.controller.abort()
      inflight.current = null
    }
  }, [startCheck])

  useEffect(() => subscribeDownload(setDownload), [])

  const checkNow = useCallback(async (): Promise<UpdateCheckResult> => {
    setChecking(true)
    try {
      return await startCheck()
    } finally {
      if (mounted.current) setChecking(false)
    }
  }, [startCheck])

  const applyNow = useCallback((): Promise<ApplyUpdateResult> => {
    if (applyTask.current) return applyTask.current
    epoch.current += 1
    inflight.current?.controller.abort()
    inflight.current = null

    const task = (async (): Promise<ApplyUpdateResult> => {
      setApplying(true)
      try {
        const result = await applyAppUpdate()
        if (result.ok) {
          clearPendingUpdate()
          setAvailable(null)
          setOfferOpen(false)
        }
        const message = result.message.trim() || (result.ok ? 'LCC обновлён' : 'Не удалось обновить LCC')
        return { ok: result.ok, message }
      } catch (err) {
        return { ok: false, message: errorText(err, 'Не удалось обновить LCC') }
      } finally {
        if (mounted.current) setApplying(false)
      }
    })().finally(() => {
      applyTask.current = null
    })

    applyTask.current = task
    return task
  }, [])

  const openOffer = useCallback(() => {
    setOfferOpen(true)
  }, [])

  const closeOffer = useCallback(() => {
    setOfferOpen(false)
  }, [])

  const value = useMemo<UpdateContextValue>(
    () => ({
      available,
      checking,
      applying,
      download,
      lastCheckedAt,
      offerOpen,
      openOffer,
      closeOffer,
      checkNow,
      applyNow,
    }),
    [
      available,
      checking,
      applying,
      download,
      lastCheckedAt,
      offerOpen,
      openOffer,
      closeOffer,
      checkNow,
      applyNow,
    ],
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdates(): UpdateContextValue {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdates вне UpdateProvider')
  return ctx
}
