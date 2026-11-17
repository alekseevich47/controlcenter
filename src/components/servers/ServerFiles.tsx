import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  decodeBytes,
  encodeBytes,
  sshAvailable,
  sshListDir,
  sshMkdir,
  sshReadFile,
  sshRemove,
  sshWriteFile,
  type RemoteFile,
  type SshMaterialAuth,
} from '../../ssh/desktop'
import { sshHost, sshSecretId } from '../../ssh/target'
import type { Server } from '../../vault/types'
import { useVault } from '../../vault/VaultContext'
import { ConfirmDialog } from '../ConfirmDialog'
import { failureMessage, serverPath } from './serverUi'

function joinPath(dir: string, name: string): string {
  if (dir === '/') return `/${name}`
  return `${dir.replace(/\/$/, '')}/${name}`
}

export function ServerFiles({ server }: { server: Server }) {
  const navigate = useNavigate()
  const { readSshMaterial } = useVault()
  const [path, setPath] = useState('/')
  const [rows, setRows] = useState<RemoteFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [folder, setFolder] = useState('')
  const [pendingDelete, setPendingDelete] = useState<RemoteFile | null>(null)

  const loadAuth = useCallback(async (): Promise<SshMaterialAuth | null> => {
    const profile = server.ssh
    const host = sshHost(server)
    if (!profile?.hostFingerprint || !host) return null
    const secret = await readSshMaterial(profile.secretId || sshSecretId(server.id))
    if (!secret) return null
    return {
      host,
      port: profile.port,
      user: profile.user,
      auth: secret.auth,
      material: secret.material,
      fingerprint: profile.hostFingerprint,
    }
  }, [readSshMaterial, server])

  const refresh = useCallback(async (nextPath: string) => {
    const auth = await loadAuth()
    if (!auth) return
    setBusy(true)
    setError(null)
    try {
      setRows(await sshListDir(auth, nextPath))
      setPath(nextPath)
    } catch (reason) {
      setError(failureMessage(reason))
    } finally {
      setBusy(false)
    }
  }, [loadAuth])

  useEffect(() => {
    if (!sshAvailable() || !server.ssh?.hostFingerprint) return
    void refresh('/')
  }, [refresh, server.ssh?.hostFingerprint])

  if (!sshAvailable()) {
    return (
      <section className="card servers-section">
        <h2 className="servers-section-title">Файлы</h2>
        <p className="servers-note">Файлы хоста открываются в приложении для компьютера.</p>
      </section>
    )
  }
  if (!server.ssh?.hostFingerprint || !sshHost(server)) {
    return (
      <section className="card servers-section">
        <h2 className="servers-section-title">Файлы</h2>
        <p className="servers-note">Сначала сохраните SSH и подтвердите отпечаток в консоли.</p>
        <button className="btn btn-ghost" type="button" onClick={() => navigate(serverPath(server.id, 'console'))}>
          К консоли
        </button>
      </section>
    )
  }

  async function download(row: RemoteFile) {
    const auth = await loadAuth()
    if (!auth || row.dir) return
    const target = joinPath(path, row.name)
    const raw = await sshReadFile(auth, target)
    const bytes = decodeBytes(raw)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new Blob([copy])
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.name
    link.click()
    URL.revokeObjectURL(url)
  }

  async function upload(file: File) {
    const auth = await loadAuth()
    if (!auth) return
    if (file.size > 8 * 1024 * 1024) {
      setError('Файл больше 8 МБ')
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await sshWriteFile(auth, joinPath(path, file.name), encodeBytes(bytes))
    await refresh(path)
  }

  return (
    <section className="card servers-section">
      <div className="servers-head-actions">
        <h2 className="servers-section-title">Файлы</h2>
        <button className="btn btn-ghost" type="button" disabled={busy || path === '/'} onClick={() => void refresh(path.split('/').slice(0, -1).join('/') || '/')}>
          Вверх
        </button>
      </div>
      <p className="mono">{path}</p>
      {error ? <p className="servers-field-error">{error}</p> : null}
      <ul className="servers-file-list">
        {rows.map((row) => (
          <li key={row.name}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => (row.dir ? void refresh(joinPath(path, row.name)) : void download(row))}
            >
              {row.dir ? 'папка' : 'файл'} {row.name}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(row)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
      <div className="servers-head-actions">
        <input
          value={folder}
          maxLength={80}
          placeholder="новая папка"
          onChange={(event) => setFolder(event.target.value)}
        />
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy || !folder.trim()}
          onClick={() => {
            void (async () => {
              const auth = await loadAuth()
              if (!auth) return
              await sshMkdir(auth, joinPath(path, folder.trim()))
              setFolder('')
              await refresh(path)
            })()
          }}
        >
          Создать
        </button>
        <label className="btn btn-ghost">
          Загрузить
          <input
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file).catch((reason) => setError(failureMessage(reason)))
            }}
          />
        </label>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Удалить на сервере?"
        message={pendingDelete ? `${pendingDelete.name} будет удалён на хосте.` : ''}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const row = pendingDelete
          if (!row) return
          setBusy(true)
          void (async () => {
            try {
              const auth = await loadAuth()
              if (!auth) return
              await sshRemove(auth, joinPath(path, row.name), row.dir)
              setPendingDelete(null)
              await refresh(path)
            } catch (reason) {
              setError(failureMessage(reason))
            } finally {
              setBusy(false)
            }
          })()
        }}
      />
    </section>
  )
}
