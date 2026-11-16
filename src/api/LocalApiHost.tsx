import { useEffect, useRef } from 'react'
import { useVault } from '../vault/VaultContext'
import { isTauri } from '../vault/runtime'
import { handleApiRequest, SlidingLimiter, type ApiHttpRequest } from './http'
import { useVaultApi } from './useVaultApi'

type BridgeJob = {
  id: string
  method: string
  path: string
  query: string
  body: string
  bearer: string | null
}

type DesktopJob = {
  id: string
  method: string
  path: string
  query: string
  body: string
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Пока vault открыт и локальный API включён, проводит HTTP-запросы в vaultApi.
 * Dev: long-poll к Vite. Desktop: события Tauri с уже проверенным bearer.
 */
export function LocalApiHost() {
  const vault = useVault()
  const api = useVaultApi()
  const limiterRef = useRef(new SlidingLimiter())
  const vaultRef = useRef(vault)
  const apiRef = useRef(api)

  useEffect(() => {
    vaultRef.current = vault
    apiRef.current = api
  })

  async function dispatch(req: ApiHttpRequest) {
    const current = vaultRef.current
    return handleApiRequest(
      {
        api: apiRef.current,
        expectedToken: current.apiToken,
        limiter: limiterRef.current,
        githubStatus: async () => ({
          connected: Boolean(vaultRef.current.githubLogin),
          login: vaultRef.current.githubLogin,
        }),
        githubToken: () => vaultRef.current.readGithubToken(),
        githubConnect: (token) => vaultRef.current.connectGithub(token),
        githubDisconnect: () => vaultRef.current.disconnectGithub(),
      },
      req,
    )
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!vault.prefs.localApi || !vault.apiToken) return
    const secret = __LCC_BRIDGE_SECRET__
    if (!secret) return
    const ctrl = new AbortController()
    let stopped = false

    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch('/__lcc_bridge/next', {
            headers: { 'x-lcc-bridge': secret },
            signal: ctrl.signal,
          })
          if (res.status === 204) continue
          if (!res.ok) {
            await sleep(400, ctrl.signal)
            continue
          }
          const job = (await res.json()) as BridgeJob
          const result = await dispatch({
            method: job.method,
            path: job.path,
            query: new URLSearchParams(job.query),
            bodyText: job.body,
            bearer: job.bearer,
          })
          if (stopped) return
          await fetch('/__lcc_bridge/result', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-lcc-bridge': secret,
            },
            body: JSON.stringify({
              id: job.id,
              status: result.status,
              body: JSON.stringify(result.body),
            }),
            signal: ctrl.signal,
          })
        } catch {
          if (stopped) return
          await sleep(400, ctrl.signal)
        }
      }
    }

    void loop()
    return () => {
      stopped = true
      ctrl.abort()
    }
  }, [vault.prefs.localApi, vault.apiToken])

  useEffect(() => {
    if (!isTauri() || !vault.prefs.localApi || !vault.apiToken) return
    const ctrl = new AbortController()
    let unlisten: (() => void) | null = null
    let stopped = false

    const run = async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')
      try {
        await invoke('local_api_set_token', { token: vault.apiToken })
        await invoke<number>('local_api_start')
      } catch {
        return
      }
      if (stopped) return
      unlisten = await listen<DesktopJob>('lcc-local-api', (event) => {
        const job = event.payload
        void (async () => {
          const result = await dispatch({
            method: job.method,
            path: job.path,
            query: new URLSearchParams(job.query),
            bodyText: job.body,
            bearer: vaultRef.current.apiToken,
          })
          if (stopped) return
          try {
            await invoke('local_api_respond', {
              id: job.id,
              status: result.status,
              body: JSON.stringify(result.body),
            })
          } catch {
            /* desktop listener уже отдал таймаут */
          }
        })()
      })
    }

    void run()
    return () => {
      stopped = true
      ctrl.abort()
      unlisten?.()
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('local_api_stop'))
        .catch(() => undefined)
    }
  }, [vault.prefs.localApi, vault.apiToken])

  return null
}
