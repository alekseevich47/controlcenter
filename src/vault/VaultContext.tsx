import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  buildAuditEvent,
  entityLabel,
  formatAuditWhen,
  snapshotEntity,
} from './audit'
import { createVaultFs, rememberVaultPath } from './createFs'
import {
  eventMatchesPurgeFilter,
  normalizeVaultPrefs,
  prefsPatchIsSignificant,
  shouldCaptureCrud,
  shouldCaptureEvent,
  shouldCaptureUpdate,
  type HistoryEventFlag,
  type HistoryPurgeFilter,
} from './historyPrefs'
import { githubWhoAmI } from '../github/client'
import { assertGithubToken } from '../github/token'
import { bindSpacewebAuth, fetchSpacewebToken } from '../hosting/runtime'
import { clearSpacewebToken, setSpacewebToken } from '../hosting/session'
import { VaultSession, type SpacewebAuthRecord } from './session'
import type { Collection, CollectionMap, VaultEvent, VaultPrefs } from './types'

type Status = 'booting' | 'locked' | 'unlocked'

interface VaultContextValue {
  status: Status
  path: string
  prefs: VaultPrefs
  error: string | null
  isTauriRuntime: boolean
  createVault: (password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => void
  pickFolder: () => Promise<void>
  savePrefs: (patch: Partial<VaultPrefs>) => Promise<void>
  syncNow: () => Promise<void>
  list: <C extends Collection>(collection: C) => Promise<CollectionMap[C][]>
  get: <C extends Collection>(collection: C, id: string) => Promise<CollectionMap[C] | null>
  put: <C extends Collection>(collection: C, entity: CollectionMap[C]) => Promise<void>
  remove: (collection: Collection, id: string) => Promise<void>
  /** Логин GitHub, без токена. */
  githubLogin: string | null
  /** Bearer локального API. В памяти, пока vault открыт и API включён. */
  apiToken: string | null
  connectGithub: (token: string) => Promise<{ login: string }>
  disconnectGithub: () => Promise<void>
  readGithubToken: () => Promise<string | null>
  /** Логин кабинета Spaceweb. Пароль и токен в это поле не входят. */
  spacewebLogin: string | null
  connectSpaceweb: (login: string, password: string) => Promise<{ login: string }>
  disconnectSpaceweb: () => Promise<void>
  /** Пароль только чтобы обновить токен. Не сохранять его в состоянии экрана. */
  readSpacewebAuth: () => Promise<SpacewebAuthRecord | null>
  readSshMaterial: (id: string) => Promise<{ auth: 'key' | 'password'; material: string } | null>
  writeSshMaterial: (id: string, auth: 'key' | 'password', material: string) => Promise<void>
  removeSshMaterial: (id: string) => Promise<void>
  readBackupPassword: (id: string) => Promise<string | null>
  writeBackupPassword: (id: string, password: string) => Promise<void>
  readMetricSamples: (id: string) => Promise<{ t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }[]>
  writeMetricSamples: (
    id: string,
    samples: { t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }[],
  ) => Promise<void>
  setLocalApiEnabled: (enabled: boolean) => Promise<void>
  rotateApiToken: () => Promise<string>
  /** Удаляет события истории по фильтру. Возвращает число удалённых. */
  purgeHistory: (filter: HistoryPurgeFilter) => Promise<number>
  refreshTick: number
  bump: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

const PURGE_CONCURRENCY = 8

async function writeSystemEvent(
  session: VaultSession,
  flag: HistoryEventFlag,
  title: string,
): Promise<void> {
  if (!shouldCaptureEvent(session.prefs, flag)) return
  const now = new Date().toISOString()
  const event: VaultEvent = {
    id: `evt-${crypto.randomUUID().slice(0, 10)}`,
    createdAt: now,
    updatedAt: now,
    title,
    when: formatAuditWhen(now),
    action: 'note',
    actor: session.prefs.profileName.trim() || 'Неизвестно',
    actorRole: session.prefs.role,
  }
  await session.put('events', event)
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('booting')
  const [session, setSession] = useState<VaultSession | null>(null)
  const [path, setPath] = useState('…')
  const [prefs, setPrefs] = useState<VaultPrefs>(() => normalizeVaultPrefs(null))
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [isTauriRuntime, setIsTauriRuntime] = useState(false)
  const [githubLogin, setGithubLogin] = useState<string | null>(null)
  const [spacewebLogin, setSpacewebLogin] = useState<string | null>(null)
  const [apiToken, setApiToken] = useState<string | null>(null)

  const hydrateIntegrations = useCallback(async (current: VaultSession) => {
    try {
      const auth = await current.readGithubAuth()
      setGithubLogin(auth?.login ?? null)
    } catch {
      setGithubLogin(null)
    }
    try {
      const auth = await current.readSpacewebAuth()
      setSpacewebLogin(auth?.login ?? null)
      if (!auth) clearSpacewebToken()
    } catch {
      setSpacewebLogin(null)
      clearSpacewebToken()
    }
    try {
      if (current.prefs.localApi) {
        const token = await current.ensureApiToken()
        setApiToken(token.token)
      } else {
        setApiToken(null)
      }
    } catch {
      setApiToken(null)
    }
  }, [])

  const bump = useCallback(() => setRefreshTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { isTauri } = await import('./runtime')
        const tauri = isTauri()
        if (!cancelled) setIsTauriRuntime(tauri)
        const { fs, path: p } = await createVaultFs()
        if (cancelled) return
        const s = new VaultSession(fs)
        setSession(s)
        setPath(p)
        const loaded = await s.loadPrefs()
        setPrefs(loaded)
        setStatus('locked')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('locked')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bindSpacewebAuth(async () => {
      if (!session?.unlocked) return null
      try {
        return await session.readSpacewebAuth()
      } catch {
        return null
      }
    })
    return () => {
      bindSpacewebAuth(async () => null)
      clearSpacewebToken()
    }
  }, [session])

  useEffect(() => {
    const onLeave = () => {
      if (prefs.syncOnExit && session?.unlocked) {
        void session.markSynced()
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [prefs.syncOnExit, session])

  const createVault = useCallback(
    async (password: string) => {
      if (!session) throw new Error('FS не готов')
      setError(null)
      await session.create(password)
      setPrefs(session.prefs)
      setStatus('unlocked')
      try {
        await writeSystemEvent(session, 'vaultUnlock', 'Создан и открыт новый vault')
      } catch {
        /* не блокируем вход из‑за audit */
      }
      await hydrateIntegrations(session)
      bump()
    },
    [session, bump, hydrateIntegrations],
  )

  const unlock = useCallback(
    async (password: string) => {
      if (!session) throw new Error('FS не готов')
      setError(null)
      const exists = await session.hasVault()
      if (!exists) {
        await session.create(password)
        setPrefs(session.prefs)
        setStatus('unlocked')
        try {
          await writeSystemEvent(session, 'vaultUnlock', 'Создан и открыт новый vault')
        } catch {
          /* ignore */
        }
      } else {
        await session.unlock(password)
        setPrefs(session.prefs)
        setStatus('unlocked')
        try {
          await writeSystemEvent(session, 'vaultUnlock', 'Vault разблокирован')
        } catch {
          /* ignore */
        }
      }
      await hydrateIntegrations(session)
      bump()
    },
    [session, bump, hydrateIntegrations],
  )

  const lock = useCallback(() => {
    clearSpacewebToken()
    if (session?.unlocked) {
      void writeSystemEvent(session, 'vaultLock', 'Vault заблокирован')
        .catch(() => undefined)
        .finally(() => {
          session.lock()
          clearSpacewebToken()
          setGithubLogin(null)
          setSpacewebLogin(null)
          setApiToken(null)
          setStatus('locked')
        })
      return
    }
    session?.lock()
    setGithubLogin(null)
    setSpacewebLogin(null)
    setApiToken(null)
    setStatus('locked')
  }, [session])

  const pickFolder = useCallback(async () => {
    if (!session) return
    if (session.fs.pickDirectory) {
      const selected = await session.fs.pickDirectory()
      if (!selected) return
      if (session.unlocked) {
        try {
          await writeSystemEvent(
            session,
            'vaultFolderChange',
            `Выбрана папка vault: ${selected}`,
          )
        } catch {
          /* ignore */
        }
      }
      rememberVaultPath(selected)
      const { fs, path: p } = await createVaultFs(selected)
      const next = new VaultSession(fs)
      setSession(next)
      setPath(p)
      setPrefs(await next.loadPrefs())
      next.lock()
      setSpacewebLogin(null)
      clearSpacewebToken()
      setStatus('locked')
    }
  }, [session])

  const savePrefs = useCallback(
    async (patch: Partial<VaultPrefs>) => {
      if (!session) return
      const next = await session.savePrefs(patch)
      setPrefs(next)
      if (session.unlocked && prefsPatchIsSignificant(patch)) {
        try {
          await writeSystemEvent(session, 'prefsChange', 'Изменены настройки vault')
          bump()
        } catch {
          /* ignore */
        }
      }
    },
    [session, bump],
  )

  const syncNow = useCallback(async () => {
    if (!session?.unlocked) throw new Error('Сначала разблокируйте vault')
    await session.markSynced()
    setPrefs({ ...session.prefs })
    try {
      await writeSystemEvent(session, 'vaultSync', 'Отмечена синхронизация vault')
      bump()
    } catch {
      /* ignore */
    }
  }, [session, bump])

  const list = useCallback(
    async <C extends Collection>(collection: C) => {
      if (!session?.unlocked) return []
      return session.list(collection)
    },
    [session],
  )

  const get = useCallback(
    async <C extends Collection>(collection: C, id: string) => {
      if (!session?.unlocked) return null
      return session.get(collection, id)
    },
    [session],
  )

  const connectGithub = useCallback(
    async (token: string) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      const clean = assertGithubToken(token)
      const login = await githubWhoAmI(clean)
      await session.writeGithubAuth({
        token: clean,
        login,
        updatedAt: new Date().toISOString(),
      })
      setGithubLogin(login)
      try {
        await writeSystemEvent(session, 'prefsChange', `Подключён GitHub: ${login}`)
        bump()
      } catch {
        /* ignore */
      }
      return { login }
    },
    [session, bump],
  )

  const disconnectGithub = useCallback(async () => {
    if (!session?.unlocked) throw new Error('Vault заблокирован')
    await session.clearGithubAuth()
    setGithubLogin(null)
    try {
      await writeSystemEvent(session, 'prefsChange', 'GitHub отключён')
      bump()
    } catch {
      /* ignore */
    }
  }, [session, bump])

  const readGithubToken = useCallback(async () => {
    if (!session?.unlocked) return null
    const auth = await session.readGithubAuth()
    return auth?.token ?? null
  }, [session])

  const connectSpaceweb = useCallback(
    async (login: string, password: string) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      const token = await fetchSpacewebToken(login, password)
      if (!session.unlocked) throw new Error('Vault заблокирован')
      const cleanLogin = login.trim()
      await session.writeSpacewebAuth({
        login: cleanLogin,
        password,
        updatedAt: new Date().toISOString(),
      })
      if (!session.unlocked) {
        clearSpacewebToken()
        throw new Error('Vault заблокирован')
      }
      setSpacewebToken(token)
      setSpacewebLogin(cleanLogin)
      return { login: cleanLogin }
    },
    [session],
  )

  const disconnectSpaceweb = useCallback(async () => {
    if (!session?.unlocked) throw new Error('Vault заблокирован')
    await session.clearSpacewebAuth()
    clearSpacewebToken()
    setSpacewebLogin(null)
  }, [session])

  const readSpacewebAuth = useCallback(async () => {
    if (!session?.unlocked) return null
    return session.readSpacewebAuth()
  }, [session])

  const setLocalApiEnabled = useCallback(
    async (enabled: boolean) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      await savePrefs({ localApi: enabled })
      if (!enabled) {
        setApiToken(null)
        return
      }
      const token = await session.ensureApiToken()
      setApiToken(token.token)
    },
    [session, savePrefs],
  )

  const rotateApiToken = useCallback(async () => {
    if (!session?.unlocked) throw new Error('Vault заблокирован')
    const token = await session.rotateApiToken()
    if (session.prefs.localApi) setApiToken(token.token)
    return token.token
  }, [session])

  const put = useCallback(
    async <C extends Collection>(collection: C, entity: CollectionMap[C]) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      // События пишем напрямую — иначе рекурсия audit → events → audit
      if (collection === 'events') {
        await session.put(collection, entity)
        bump()
        return
      }
      const prev = await session.get(collection, entity.id)
      await session.put(collection, entity)
      const action = prev ? 'update' : 'create'
      const before = snapshotEntity(prev)
      const after = snapshotEntity(entity)
      const capture =
        action === 'update'
          ? shouldCaptureUpdate(session.prefs, collection, before, after)
          : shouldCaptureCrud(session.prefs, collection, action)
      if (capture) {
        const audit = buildAuditEvent({
          action,
          collection,
          entityId: entity.id,
          entityLabel: entityLabel(collection, entity),
          actor: session.prefs.profileName,
          actorRole: session.prefs.role,
          before,
          after,
        })
        await session.put('events', audit)
      }
      bump()
    },
    [session, bump],
  )

  const remove = useCallback(
    async (collection: Collection, id: string) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      const safeId = id.replace(/[/\\]/g, '')
      if (!safeId || safeId !== id) throw new Error('Некорректный id')
      if (collection === 'events') {
        await session.remove(collection, safeId)
        bump()
        return
      }
      const prev = await session.get(collection, safeId)
      await session.remove(collection, safeId)
      if (prev && shouldCaptureCrud(session.prefs, collection, 'delete')) {
        const before = snapshotEntity(prev)
        const audit = buildAuditEvent({
          action: 'delete',
          collection,
          entityId: prev.id,
          entityLabel: entityLabel(collection, prev),
          actor: session.prefs.profileName,
          actorRole: session.prefs.role,
          before,
          after: null,
        })
        await session.put('events', audit)
      }
      bump()
    },
    [session, bump],
  )

  const readSshMaterial = useCallback(
    async (id: string) => (session ? session.readSshMaterial(id) : null),
    [session],
  )
  const writeSshMaterial = useCallback(
    async (id: string, auth: 'key' | 'password', material: string) => {
      if (!session) throw new Error('Vault закрыт')
      await session.writeSshMaterial(id, auth, material)
    },
    [session],
  )
  const removeSshMaterial = useCallback(
    async (id: string) => {
      if (!session) throw new Error('Vault закрыт')
      await session.removeSshMaterial(id)
    },
    [session],
  )
  const readBackupPassword = useCallback(
    async (id: string) => (session ? session.readBackupPassword(id) : null),
    [session],
  )
  const writeBackupPassword = useCallback(
    async (id: string, password: string) => {
      if (!session) throw new Error('Vault закрыт')
      await session.writeBackupPassword(id, password)
    },
    [session],
  )
  const readMetricSamples = useCallback(
    async (id: string) => (session ? session.readMetricSamples(id) : []),
    [session],
  )
  const writeMetricSamples = useCallback(
    async (id: string, samples: { t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }[]) => {
      if (!session) throw new Error('Vault закрыт')
      await session.writeMetricSamples(id, samples)
    },
    [session],
  )

  const purgeHistory = useCallback(
    async (filter: HistoryPurgeFilter) => {
      if (!session?.unlocked) throw new Error('Vault заблокирован')
      const events = await session.list('events')
      const targets = events.filter((e) => eventMatchesPurgeFilter(e, filter))
      for (let i = 0; i < targets.length; i += PURGE_CONCURRENCY) {
        const chunk = targets.slice(i, i + PURGE_CONCURRENCY)
        await Promise.all(chunk.map((e) => session.remove('events', e.id)))
      }
      try {
        await writeSystemEvent(
          session,
          'historyPurge',
          `Очищена история: удалено записей — ${targets.length}`,
        )
      } catch {
        /* ignore */
      }
      bump()
      return targets.length
    },
    [session, bump],
  )

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      path,
      prefs,
      error,
      isTauriRuntime,
      createVault,
      unlock,
      lock,
      pickFolder,
      savePrefs,
      syncNow,
      list,
      get,
      put,
      remove,
      githubLogin,
      spacewebLogin,
      apiToken,
      connectGithub,
      disconnectGithub,
      readGithubToken,
      connectSpaceweb,
      disconnectSpaceweb,
      readSpacewebAuth,
      readSshMaterial,
      writeSshMaterial,
      removeSshMaterial,
      readMetricSamples,
      writeMetricSamples,
      readBackupPassword,
      writeBackupPassword,
      setLocalApiEnabled,
      rotateApiToken,
      purgeHistory,
      refreshTick,
      bump,
    }),
    [
      status,
      path,
      prefs,
      error,
      isTauriRuntime,
      createVault,
      unlock,
      lock,
      pickFolder,
      savePrefs,
      syncNow,
      list,
      get,
      put,
      remove,
      githubLogin,
      spacewebLogin,
      apiToken,
      connectGithub,
      disconnectGithub,
      readGithubToken,
      connectSpaceweb,
      disconnectSpaceweb,
      readSpacewebAuth,
      readSshMaterial,
      writeSshMaterial,
      removeSshMaterial,
      readMetricSamples,
      writeMetricSamples,
      readBackupPassword,
      writeBackupPassword,
      setLocalApiEnabled,
      rotateApiToken,
      purgeHistory,
      refreshTick,
      bump,
    ],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault вне VaultProvider')
  return ctx
}
