import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {
  decodeBytes,
  encodeBytes,
  sshAvailable,
  sshProbe,
  sshPtyClose,
  sshPtyOpen,
  sshPtyResize,
  sshPtyWrite,
  type SshMaterialAuth,
} from '../../ssh/desktop'
import { sshHost, sshSecretId } from '../../ssh/target'
import { normalizeServer } from '../../vault/serverModel'
import type { Server } from '../../vault/types'
import { useVault } from '../../vault/VaultContext'
import { failureMessage, serverPath } from './serverUi'
import { useNavigate } from 'react-router-dom'

type PtyEvent = { id?: string; kind?: string; data?: string }

export function ServerConsole({ server }: { server: Server }) {
  const navigate = useNavigate()
  const { get, put, readSshMaterial } = useVault()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const ptyRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const [phase, setPhase] = useState<'idle' | 'ask' | 'live' | 'browser'>('idle')
  const [fingerprint, setFingerprint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return () => {
      stopRef.current?.()
      const id = ptyRef.current
      ptyRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      if (id) void sshPtyClose(id).catch(() => undefined)
    }
  }, [])

  async function material(): Promise<SshMaterialAuth | null> {
    const profile = server.ssh
    const host = sshHost(server)
    if (!profile || !host) return null
    const secret = await readSshMaterial(profile.secretId || sshSecretId(server.id))
    if (!secret) return null
    return {
      host,
      port: profile.port,
      user: profile.user,
      auth: secret.auth,
      material: secret.material,
      fingerprint: profile.hostFingerprint ?? '',
    }
  }

  async function trustAndOpen() {
    if (!fingerprint || !server.ssh) return
    setBusy(true)
    setError(null)
    try {
      const fresh = (await get('servers', server.id)) ?? server
      if (!fresh.ssh) return
      await put(
        'servers',
        normalizeServer({
          ...fresh,
          ssh: { ...fresh.ssh, hostFingerprint: fingerprint },
          updatedAt: new Date().toISOString(),
        }),
      )
      await openPty({ ...(await materialOrThrow()), fingerprint })
    } catch (reason) {
      setError(failureMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function materialOrThrow(): Promise<SshMaterialAuth> {
    const auth = await material()
    if (!auth) throw new Error('Сохранённый доступ не найден')
    return auth
  }

  async function openPty(auth: SshMaterialAuth) {
    const node = hostRef.current
    if (!node) return
    termRef.current?.dispose()
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 14,
      theme: { background: '#141414', foreground: '#e7e7e7', cursor: '#c6f53d' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(node)
    fit.fit()
    termRef.current = term
    const id = await sshPtyOpen(auth, term.cols, term.rows)
    ptyRef.current = id
    term.onData((chunk) => {
      void sshPtyWrite(id, encodeBytes(new TextEncoder().encode(chunk))).catch((reason) => {
        setError(failureMessage(reason))
      })
    })
    term.onResize(({ cols, rows }) => {
      void sshPtyResize(id, cols, rows).catch(() => undefined)
    })
    const unlisten = await listen<PtyEvent>('ssh-pty', (event) => {
      if (event.payload.id !== id) return
      if (event.payload.kind === 'data' && event.payload.data) {
        term.write(decodeBytes(event.payload.data))
      }
      if (event.payload.kind === 'exit') {
        term.writeln('\r\nсессия закрыта')
      }
    })
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(node)
    term.focus()
    setPhase('live')
    stopRef.current?.()
    stopRef.current = () => {
      observer.disconnect()
      void unlisten()
    }
  }

  async function connect() {
    if (!sshAvailable()) {
      setPhase('browser')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const auth = await material()
      if (!auth) {
        setError('Сохранённый доступ не найден')
        return
      }
      const probe = await sshProbe(auth)
      if (!probe.accepted || probe.fingerprint !== server.ssh?.hostFingerprint) {
        setFingerprint(probe.fingerprint)
        setPhase('ask')
        return
      }
      await openPty(auth)
    } catch (reason) {
      setError(failureMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  if (!sshAvailable()) {
    return (
      <section className="card servers-section">
        <h2 className="servers-section-title">Консоль</h2>
        <p className="servers-note">Консоль доступна в приложении для компьютера. В браузере команды не запускаются.</p>
      </section>
    )
  }

  if (!server.ssh || !sshHost(server)) {
    return (
      <section className="card servers-section">
        <h2 className="servers-section-title">Консоль</h2>
        <p className="servers-note">
          Клик по терминалу поставит курсор внутрь, когда доступ сохранён. Сейчас укажите SSH в настройках.
        </p>
        <button className="btn btn-ghost" type="button" onClick={() => navigate(serverPath(server.id, 'settings'))}>
          Настройки SSH
        </button>
      </section>
    )
  }

  return (
    <section className="card servers-section">
      <div className="servers-head-actions">
        <h2 className="servers-section-title">Консоль</h2>
        {phase !== 'live' ? (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void connect()}>
            Подключить
          </button>
        ) : null}
      </div>
      {phase === 'ask' ? (
        <div className="servers-trust">
          <p className="servers-note">
            Отпечаток хоста {fingerprint}. Подтвердите его один раз. Если он изменился, соединение не откроется само.
          </p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void trustAndOpen()}>
            Доверять
          </button>
        </div>
      ) : null}
      {error ? <p className="servers-field-error">{error}</p> : null}
      <div
        ref={hostRef}
        className="server-terminal"
        onMouseDown={() => termRef.current?.focus()}
      />
    </section>
  )
}
