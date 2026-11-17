import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { serverLinks } from '../../vault/serverModel'
import type { Server } from '../../vault/types'
import { useCollection } from '../../vault/useCollection'
import { IconSettings, IconTerminal } from '../Icons'
import { ServerPowerButtons } from './ServerPowerButtons'
import { formatCheckedAt, previewFacts, serverDescription, serverPath, statusDotClass, type ServerTabId } from './serverUi'

interface ServerPreviewProps {
  server: Server
  onRefresh: () => void
}

export function ServerPreview({ server, onRefresh }: ServerPreviewProps) {
  const navigate = useNavigate()
  const { items: projects } = useCollection('projects')
  const links = serverLinks(server)
  const facts = previewFacts(server)
  const names = useMemo(() => {
    const map = new Map(projects.map((project) => [project.id, project.name]))
    return map
  }, [projects])

  function open(tab: ServerTabId) {
    navigate(serverPath(server.id, tab))
  }

  const checkedAt = server.hostSnapshot?.checkedAt

  return (
    <div className="servers-preview-body">
      <div className="servers-preview-top">
        <button
          type="button"
          className="servers-preview-head"
          aria-label={`Открыть ${server.name}, ${server.status}`}
          onClick={() => open('overview')}
        >
          <span className={`servers-dot ${statusDotClass(server.statusKind)}`} aria-hidden="true" />
          <span className="servers-preview-titles">
            <span className="servers-preview-name">
              <strong>{server.name}</strong>
              <span className={`badge badge-${server.statusKind}`}>{server.status}</span>
            </span>
            <span className="servers-preview-desc">{serverDescription(server)}</span>
          </span>
        </button>
        <div className="servers-preview-tools">
          <button type="button" className="btn btn-primary" onClick={() => open('overview')}>
            Открыть
          </button>
          <ServerPowerButtons server={server} onRefresh={onRefresh} />
          <button
            type="button"
            className="icon-action"
            aria-label={`Настройки ${server.name}`}
            title="Настройки"
            onClick={() => open('settings')}
          >
            <IconSettings width={16} height={16} />
          </button>
          <button
            type="button"
            className="icon-action"
            aria-label={`Консоль ${server.name}`}
            title="Консоль"
            onClick={() => open('console')}
          >
            <IconTerminal />
          </button>
        </div>
      </div>

      <div className="kv servers-preview-kv">
        {facts.map((fact) => (
          <div key={fact.label}>
            <small>{fact.label}</small>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>

      {checkedAt ? <p className="servers-note">Проверен {formatCheckedAt(checkedAt)}</p> : null}

      {links.length > 0 ? (
        <div className="servers-chips" aria-label="Проекты">
          {links.map((link) => (
            <span key={link.projectId} className="badge badge-lime">
              {names.get(link.projectId) ?? link.projectId}
            </span>
          ))}
        </div>
      ) : (
        <p className="servers-note">Проекты не привязаны</p>
      )}

      <section className="servers-preview-more">
        <h3>Проекты</h3>
        {links.length === 0 ? null : (
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
        <p className="servers-note">Графики, консоль и файлы открываются на полном экране.</p>
      </section>
    </div>
  )
}
