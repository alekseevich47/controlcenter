import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { sshAvailable, type SshMaterialAuth } from '../../ssh/desktop'
import { sshHost, sshSecretId } from '../../ssh/target'
import { normalizeServer, serverLinks } from '../../vault/serverModel'
import type { Server, ServerBackupPolicy } from '../../vault/types'
import { useCollection } from '../../vault/useCollection'
import { useVault } from '../../vault/VaultContext'
import { ConfirmDialog } from '../ConfirmDialog'
import { useToast } from '../ToastProvider'
import { failureMessage } from './serverUi'

function newPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function ServerBackupPanel({ server }: { server: Server }) {
  const { get, put, readSshMaterial, readBackupPassword, writeBackupPassword, prefs, savePrefs } = useVault()
  const { items: projects } = useCollection('projects')
  const { notify } = useToast()
  const links = serverLinks(server)
  const [repo, setRepo] = useState(
    server.backup?.destination.kind === 'local' ? server.backup.destination.path : '/var/backups/lcc',
  )
  const [hour, setHour] = useState(String(server.backup?.hour ?? 3))
  const [keepDaily, setKeepDaily] = useState(String(server.backup?.retention.keepDaily ?? 7))
  const [keepWeekly, setKeepWeekly] = useState(String(server.backup?.retention.keepWeekly ?? 4))
  const [keepMonthly, setKeepMonthly] = useState(String(server.backup?.retention.keepMonthly ?? 3))
  const [picked, setPicked] = useState<string[]>(server.backup?.includeProjectIds ?? links.map((link) => link.projectId))
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [restoreId, setRestoreId] = useState<string | null>(null)

  async function auth(): Promise<SshMaterialAuth | null> {
    const profile = server.ssh
    const host = sshHost(server)
    if (!profile?.hostFingerprint || !host || !sshAvailable()) return null
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
  }

  function paths(): string[] {
    return links
      .filter((link) => picked.includes(link.projectId) && link.root)
      .map((link) => link.root as string)
  }

  async function savePolicy() {
    const hourNum = Number(hour)
    const retention = {
      keepDaily: Number(keepDaily),
      keepWeekly: Number(keepWeekly),
      keepMonthly: Number(keepMonthly),
    }
    if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
      notify({ message: 'Час запуска: 0–23', tone: 'danger' })
      return
    }
    if (Object.values(retention).some((value) => !Number.isInteger(value) || value < 0 || value > 3650)) {
      notify({ message: 'Срок хранения: целые 0–3650', tone: 'danger' })
      return
    }
    setBusy(true)
    try {
      let password = await readBackupPassword(server.id)
      if (!password) {
        password = newPassword()
        await writeBackupPassword(server.id, password)
      }
      const policy: ServerBackupPolicy = {
        destination: { kind: 'local', path: repo.trim() },
        passwordRef: server.id,
        hour: hourNum,
        retention,
        includeProjectIds: picked,
        extraPaths: [],
      }
      const fresh = (await get('servers', server.id)) ?? server
      await put('servers', normalizeServer({ ...fresh, backup: policy, updatedAt: new Date().toISOString() }))
      notify({ message: 'Политика бэкапа сохранена. Пароль репозитория больше не спрашивается', tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function run(action: 'backup' | 'snapshots' | 'restore' | 'timer', snapshot = '') {
    const ready = await auth()
    const password = await readBackupPassword(server.id)
    if (!ready || !password) {
      notify({ message: 'Нужны сохранённый SSH с отпечатком и политика бэкапа', tone: 'danger' })
      return
    }
    setBusy(true)
    try {
      const text = await invoke<string>('ssh_restic', {
        job: {
          auth: ready,
          action,
          repo: repo.trim(),
          password,
          paths: paths(),
          snapshot,
          target: paths()[0] ?? '/',
          hour: Number(hour) || 0,
        },
      })
      setOutput(text.slice(0, 4000))
      notify({
        message: action === 'backup' ? 'Снимок на сервере создан' : 'Готово',
        tone: 'success',
      })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function copyHere() {
    if (!sshAvailable()) {
      notify({ message: 'Копия на это устройство снимается в приложении для компьютера', tone: 'info' })
      return
    }
    const ready = await auth()
    if (!ready) {
      notify({ message: 'Сначала сохраните SSH и подтвердите отпечаток', tone: 'danger' })
      return
    }
    let selected = prefs.backup?.localDir ?? ''
    if (!selected) {
      const dialog = await import('@tauri-apps/plugin-dialog')
      const picked = await dialog.open({ directory: true, multiple: false, title: 'Папка для копий' })
      selected = typeof picked === 'string' ? picked : ''
    }
    if (typeof selected !== 'string' || !selected) return
    await savePrefs({ backup: { localDir: selected } })
    setBusy(true)
    try {
      const folder = await invoke<string>('ssh_pull_tree', {
        job: { auth: ready, dest: selected, paths: paths() },
      })
      setOutput(folder)
      notify({ message: 'Копия лежит на этом компьютере', tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function restoreHere() {
    if (!output.startsWith('/') && !output.includes(':')) {
      notify({ message: 'Сначала снимите копию на это устройство', tone: 'info' })
      return
    }
    const ready = await auth()
    const remote = paths()[0]
    if (!ready || !remote) return
    setBusy(true)
    try {
      await invoke('ssh_push_tree', {
        job: { auth: ready, localRoot: output, remoteRoot: remote },
      })
      notify({ message: 'Копия с этого компьютера записана обратно', tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card servers-section">
      <h2 className="servers-section-title">Бэкапы</h2>
      <p className="servers-note">
        Свои копии LCC через restic на сервере. Платные бэкапы хостера не используются. Кнопка ниже забирает
        копию на компьютер, где открыта программа.
      </p>
      <div className="servers-form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="backup-repo">Каталог репозитория на сервере</label>
          <input id="backup-repo" value={repo} maxLength={240} disabled={busy} onChange={(event) => setRepo(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="backup-hour">Час запуска</label>
          <input id="backup-hour" value={hour} inputMode="numeric" disabled={busy} onChange={(event) => setHour(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="backup-daily">Суток</label>
          <input id="backup-daily" value={keepDaily} inputMode="numeric" disabled={busy} onChange={(event) => setKeepDaily(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="backup-weekly">Недель</label>
          <input id="backup-weekly" value={keepWeekly} inputMode="numeric" disabled={busy} onChange={(event) => setKeepWeekly(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="backup-monthly">Месяцев</label>
          <input id="backup-monthly" value={keepMonthly} inputMode="numeric" disabled={busy} onChange={(event) => setKeepMonthly(event.target.value)} />
        </div>
      </div>
      <div className="servers-file-list">
        {links.map((link) => (
          <label key={link.projectId}>
            <input
              type="checkbox"
              checked={picked.includes(link.projectId)}
              onChange={(event) =>
                setPicked((current) =>
                  event.target.checked ? [...current, link.projectId] : current.filter((id) => id !== link.projectId),
                )
              }
            />{' '}
            {projects.find((project) => project.id === link.projectId)?.name ?? link.projectId}
            {link.root ? ` · ${link.root}` : ' · каталог не указан'}
          </label>
        ))}
      </div>
      <div className="servers-head-actions">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void savePolicy()}>
          Сохранить политику
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy || !sshAvailable()} onClick={() => void run('backup')}>
          Создать сейчас
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy || !sshAvailable()} onClick={() => void run('timer')}>
          Поставить расписание
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy || !sshAvailable()} onClick={() => void run('snapshots')}>
          Список снимков
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void copyHere()}>
          Скопировать на это устройство
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy || !output} onClick={() => void restoreHere()}>
          Восстановить с этого устройства
        </button>
      </div>
      {output ? <pre className="servers-note mono">{output}</pre> : null}
      <ConfirmDialog
        open={Boolean(restoreId)}
        title="Восстановить снимок?"
        message="Файлы на сервере будут перезаписаны из выбранного снимка."
        confirmLabel="Восстановить"
        danger
        busy={busy}
        onCancel={() => setRestoreId(null)}
        onConfirm={() => {
          const id = restoreId
          setRestoreId(null)
          if (id) void run('restore', id)
        }}
      />
    </section>
  )
}
