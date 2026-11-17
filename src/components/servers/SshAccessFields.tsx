import { useState } from 'react'
import { sshHost, sshSecretId } from '../../ssh/target'
import { normalizeServer } from '../../vault/serverModel'
import type { Server, ServerSshProfile } from '../../vault/types'
import { useVault } from '../../vault/VaultContext'
import { CustomSelect } from '../CustomSelect'
import { useToast } from '../ToastProvider'
import { failureMessage } from './serverUi'

const USER = /^[a-z_][a-z0-9_-]{0,31}$/

export function SshAccessFields({ server }: { server: Server }) {
  const { get, put, readSshMaterial, writeSshMaterial, removeSshMaterial } = useVault()
  const { notify } = useToast()
  const saved = server.ssh
  const [user, setUser] = useState(saved?.user ?? 'root')
  const [port, setPort] = useState(String(saved?.port ?? 22))
  const [auth, setAuth] = useState<'key' | 'password'>(saved?.auth ?? 'key')
  const [material, setMaterial] = useState('')
  const [editing, setEditing] = useState(!saved)
  const [busy, setBusy] = useState(false)

  async function save() {
    const nextUser = user.trim()
    const nextPort = Number(port)
    if (!USER.test(nextUser)) {
      notify({ message: 'Пользователь SSH: строчные буквы, цифры, _ и -', tone: 'danger' })
      return
    }
    if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
      notify({ message: 'Порт SSH: число от 1 до 65535', tone: 'danger' })
      return
    }
    const secretId = saved?.secretId || sshSecretId(server.id)
    setBusy(true)
    try {
      if (editing) {
        if (!material.trim()) {
          notify({ message: auth === 'key' ? 'Вставьте приватный ключ' : 'Введите пароль', tone: 'danger' })
          return
        }
        await writeSshMaterial(secretId, auth, material)
      } else if (saved) {
        const existing = await readSshMaterial(saved.secretId)
        if (!existing) {
          notify({ message: 'Сохранённый ключ не найден. Задайте его снова', tone: 'danger' })
          setEditing(true)
          return
        }
      }
      const fresh = (await get('servers', server.id)) ?? server
      const profile: ServerSshProfile = {
        user: nextUser,
        port: nextPort,
        auth: editing ? auth : saved?.auth ?? auth,
        secretId,
        ...(saved?.hostFingerprint ? { hostFingerprint: saved.hostFingerprint } : {}),
      }
      await put('servers', normalizeServer({ ...fresh, ssh: profile, updatedAt: new Date().toISOString() }))
      setMaterial('')
      setEditing(false)
      notify({ message: 'Доступ SSH сохранён. Повторно вводить его не нужно', tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (!saved) return
    setBusy(true)
    try {
      await removeSshMaterial(saved.secretId)
      const fresh = (await get('servers', server.id)) ?? server
      const { ssh: _ssh, ...rest } = fresh
      await put('servers', normalizeServer({ ...rest, updatedAt: new Date().toISOString() }))
      setMaterial('')
      setEditing(true)
      notify({ message: 'Доступ SSH удалён из LCC', tone: 'info' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const address = sshHost(server)

  return (
    <section className="card servers-section">
      <h2 className="servers-section-title">SSH</h2>
      <p className="servers-note">
        Ключ или пароль задаются один раз и хранятся отдельно от карточки. Консоль, файлы и замеры
        подключаются сами.
      </p>
      {!address ? (
        <p className="servers-note">Для соединения в поле «Хост» нужен IP или домен без пробелов.</p>
      ) : (
        <p className="servers-note">Адрес соединения: {address}</p>
      )}
      {saved && !editing ? (
        <p className="servers-note">
          {saved.auth === 'key' ? 'Ключ задан' : 'Пароль задан'}. Пользователь {saved.user}, порт {saved.port}.
          {saved.hostFingerprint ? ` Отпечаток ${saved.hostFingerprint}.` : ' Отпечаток хоста ещё не подтверждён.'}
        </p>
      ) : null}
      <div className="servers-form-grid">
        <div className="field">
          <label htmlFor="ssh-user">Пользователь</label>
          <input id="ssh-user" value={user} maxLength={32} disabled={busy} onChange={(event) => setUser(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ssh-port">Порт</label>
          <input id="ssh-port" value={port} inputMode="numeric" disabled={busy} onChange={(event) => setPort(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ssh-auth">Способ</label>
          <CustomSelect
            id="ssh-auth"
            value={auth}
            disabled={busy || Boolean(saved && !editing)}
            options={[
              { value: 'key', label: 'Ключ' },
              { value: 'password', label: 'Пароль' },
            ]}
            onChange={(value) => setAuth(value === 'password' ? 'password' : 'key')}
          />
        </div>
      </div>
      {editing ? (
        <div className="field">
          <label htmlFor="ssh-material">{auth === 'key' ? 'Приватный ключ' : 'Пароль'}</label>
          {auth === 'key' ? (
            <textarea
              id="ssh-material"
              className="servers-ssh-key"
              value={material}
              disabled={busy}
              spellCheck={false}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              onChange={(event) => setMaterial(event.target.value)}
            />
          ) : (
            <input
              id="ssh-material"
              type="password"
              value={material}
              disabled={busy}
              autoComplete="new-password"
              onChange={(event) => setMaterial(event.target.value)}
            />
          )}
        </div>
      ) : null}
      <div className="servers-head-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>
          Сохранить доступ
        </button>
        {saved && !editing ? (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setEditing(true)}>
            Сменить
          </button>
        ) : null}
        {saved ? (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void clear()}>
            Удалить доступ
          </button>
        ) : null}
      </div>
    </section>
  )
}
