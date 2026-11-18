import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSpacewebClient } from '../../hosting/runtime'
import type { SpacewebRosterPhase } from '../../hosting/sync'
import type { SpacewebOperationLog, SpacewebVps } from '../../hosting/spaceweb'
import { serverLinks } from '../../vault/serverModel'
import type { Server } from '../../vault/types'
import { useCollection } from '../../vault/useCollection'
import { useVault } from '../../vault/VaultContext'
import { sshAvailable, sshJournal } from '../../ssh/desktop'
import { sshHost } from '../../ssh/target'
import { ServerBackupPanel } from './ServerBackupPanel'
import { ServerSettingsForm } from './ServerSettingsForm'
import { destinationLabel, failureMessage, formatCheckedAt, formatHour, serverPath } from './serverUi'

export function ServerOverview({ server }: { server: Server }) {
  const { items: projects } = useCollection('projects')
  const { items: domains } = useCollection('domains')
  const links = serverLinks(server)
  const names = new Map(projects.map((project) => [project.id, project.name]))
  const bound = domains.filter((domain) => domain.serverId === server.id)
  const snap = server.hostSnapshot

  return (
    <div className="servers-stack">
      <section className="card servers-section">
        <h2 className="servers-section-title">Паспорт</h2>
        <p className="servers-lead">{server.description?.trim() || 'Без описания'}</p>
        <div className="kv">
          <div>
            <small>Хост</small>
            <strong>{server.host || '—'}</strong>
          </div>
          <div>
            <small>Роль</small>
            <strong>{server.role || '—'}</strong>
          </div>
          <div>
            <small>Ресурсы</small>
            <strong>{server.specs || '—'}</strong>
          </div>
          <div>
            <small>Статус</small>
            <strong>
              <span className={`badge badge-${server.statusKind}`}>{server.status}</span>
            </strong>
          </div>
          <div>
            <small>Хостер</small>
            <strong>{server.provider?.kind ?? 'без хостера'}</strong>
          </div>
          <div>
            <small>Письмо при смене статуса</small>
            <strong>{server.notifyStatus ? 'Да' : 'Нет'}</strong>
          </div>
          {snap?.ip ? (
            <div>
              <small>IP</small>
              <strong>{snap.ip}</strong>
            </div>
          ) : null}
          {snap?.os ? (
            <div>
              <small>ОС</small>
              <strong>{snap.os}</strong>
            </div>
          ) : null}
          {snap?.plan ? (
            <div>
              <small>План</small>
              <strong>{snap.plan}</strong>
            </div>
          ) : null}
          {snap?.location ? (
            <div>
              <small>Локация</small>
              <strong>{snap.location}</strong>
            </div>
          ) : null}
          {snap?.checkedAt ? (
            <div>
              <small>Проверен</small>
              <strong>{formatCheckedAt(snap.checkedAt)}</strong>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card servers-section">
        <h2 className="servers-section-title">Замеры</h2>
        <p className="servers-note">Проценты появятся после SSH. Сейчас замеров нет.</p>
      </section>

      <section className="card servers-section">
        <h2 className="servers-section-title">Проекты</h2>
        {links.length === 0 ? (
          <p className="servers-note">Проекты не привязаны.</p>
        ) : (
          <ul className="servers-plain-list">
            {links.map((link) => (
              <li key={link.projectId}>
                <strong>{names.get(link.projectId) ?? link.projectId}</strong>
                {link.root ? <span className="mono">{link.root}</span> : null}
                {link.database ? (
                  <span>
                    {link.database.engine} · {link.database.name}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card servers-section">
        <h2 className="servers-section-title">Домены</h2>
        {bound.length === 0 ? (
          <p className="servers-note">Домены не привязаны.</p>
        ) : (
          <ul className="servers-plain-list">
            {bound.map((domain) => (
              <li key={domain.id}>
                <strong>{domain.domain}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card servers-section">
        <h2 className="servers-section-title">Доступ</h2>
        {server.ssh ? (
          <div className="kv">
            <div>
              <small>Пользователь</small>
              <strong>{server.ssh.user}</strong>
            </div>
            <div>
              <small>Порт</small>
              <strong>{server.ssh.port}</strong>
            </div>
          </div>
        ) : (
          <p className="servers-note">SSH не задан.</p>
        )}
      </section>

      <section className="card servers-section">
        <h2 className="servers-section-title">Бэкап</h2>
        {server.backup ? (
          <div className="kv">
            <div>
              <small>Куда</small>
              <strong>{destinationLabel(server.backup.destination.kind)}</strong>
            </div>
            <div>
              <small>Час</small>
              <strong>{formatHour(server.backup.hour)}</strong>
            </div>
          </div>
        ) : (
          <p className="servers-note">Политики бэкапа нет.</p>
        )}
      </section>
    </div>
  )
}

const EMPTY_COPY: Record<'monitoring' | 'console' | 'files', { title: string; text: string }> = {
  monitoring: {
    title: 'Мониторинг',
    text: 'Процентов CPU, памяти и диска пока нет. Они появятся после SSH.',
  },
  console: {
    title: 'Консоль',
    text: 'Клик по терминалу поставит курсор внутрь, когда доступ сохранён. Сейчас укажите SSH в настройках.',
  },
  files: {
    title: 'Файлы',
    text: 'Файлы хоста откроются после SSH. Сейчас каталога нет.',
  },
}

export function ServerEmptyTab({
  serverId,
  tab,
}: {
  serverId: string
  tab: 'monitoring' | 'console' | 'files'
}) {
  const navigate = useNavigate()
  const copy = EMPTY_COPY[tab]
  return (
    <section className="card servers-section">
      <h2 className="servers-section-title">{copy.title}</h2>
      <div className={tab === 'console' ? 'servers-console-empty' : undefined}>
        <p className="servers-note">{copy.text}</p>
      </div>
      {tab === 'console' ? (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate(serverPath(serverId, 'settings'))}
        >
          Настройки SSH
        </button>
      ) : null}
    </section>
  )
}

export function ServerBackupsTab({ server }: { server: Server }) {
  return <ServerBackupPanel server={server} />
}

function GuestJournal({ server }: { server: Server }) {
  const { readSshMaterial } = useVault()
  const [lines, setLines] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(server.ssh?.hostFingerprint && sshHost(server) && sshAvailable())

  useEffect(() => {
    if (!ready || !server.ssh?.hostFingerprint) return
    let stop = false
    void (async () => {
      const host = sshHost(server)
      const secret = await readSshMaterial(server.ssh?.secretId || server.id)
      if (!host || !secret || !server.ssh) return
      try {
        const rows = await sshJournal({
          host,
          port: server.ssh.port,
          user: server.ssh.user,
          auth: secret.auth,
          material: secret.material,
          fingerprint: server.ssh.hostFingerprint ?? '',
        })
        if (!stop) setLines(rows)
      } catch (reason) {
        if (!stop) setError(failureMessage(reason))
      }
    })()
    return () => {
      stop = true
    }
  }, [readSshMaterial, ready, server])

  if (!ready) {
    return <p className="servers-note">Журналы сервисов внутри ОС появятся после SSH.</p>
  }
  const needle = query.trim().toLowerCase()
  const shown = (lines ?? []).filter((line) => !needle || line.toLowerCase().includes(needle)).slice(0, 200)
  return (
    <div>
      <h2 className="servers-section-title">Журнал ОС</h2>
      <input value={query} maxLength={80} placeholder="Фильтр на этом экране" onChange={(event) => setQuery(event.target.value)} />
      {error ? <p className="servers-field-error">{error}</p> : null}
      <ul className="servers-file-list">
        {shown.map((line, index) => (
          <li key={`${index}-${line.slice(0, 24)}`}>
            <span className="mono">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ServerJournalsTab({ server }: { server: Server }) {
  const billingId = server.provider?.kind === 'spaceweb' ? server.provider.billingId : ''
  const [logs, setLogs] = useState<SpacewebOperationLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logsFor, setLogsFor] = useState(billingId)
  if (logsFor !== billingId) {
    setLogsFor(billingId)
    setLogs(null)
    setError(null)
  }

  useEffect(() => {
    if (!billingId) return
    let cancelled = false
    void (async () => {
      try {
        const client = await getSpacewebClient()
        if (!client) {
          if (!cancelled) setError('Кабинет Spaceweb не подключён')
          return
        }
        const rows = await client.logs(billingId)
        if (!cancelled) setLogs(rows)
      } catch (err) {
        if (!cancelled) setError(failureMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [billingId])

  if (!billingId) {
    return (
      <section className="card servers-section">
        <h2 className="servers-section-title">Журналы</h2>
        <GuestJournal server={server} />
      </section>
    )
  }

  return (
    <section className="card servers-section">
      <h2 className="servers-section-title">Операции хостера</h2>
      {error ? <p className="servers-note">{error}</p> : null}
      {!error && logs === null ? <p className="servers-note">Читаем операции…</p> : null}
      {logs && logs.length === 0 ? <p className="servers-note">Операций пока нет.</p> : null}
      {logs && logs.length > 0 ? (
        <ul className="servers-ops">
          <li className="servers-ops-head">
            <span>Тип</span>
            <span>Статус</span>
            <span>Начало</span>
            <span>Конец</span>
          </li>
          {logs.map((row, index) => (
            <li key={`${row.startedAt}-${row.type}-${index}`}>
              <span>{row.type || '—'}</span>
              <span>{row.status || '—'}</span>
              <span>{row.startedAt || '—'}</span>
              <span>{row.endedAt || '—'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <GuestJournal server={server} />
    </section>
  )
}

export function ServerSettingsTab({
  server,
  vps,
  vpsPhase,
}: {
  server: Server
  vps: readonly SpacewebVps[]
  vpsPhase: SpacewebRosterPhase
}) {
  return <ServerSettingsForm key={server.id} server={server} vps={vps} vpsPhase={vpsPhase} />
}
