import type { Server } from '../../vault/types'
import { IconTrash } from '../Icons'
import { formatCheckedAt, providerLabel, statusDotClass } from './serverUi'

interface ServerCardProps {
  server: Server
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onDetach?: () => void
}

export function ServerCard({ server, selected, onToggle, onDelete, onDetach }: ServerCardProps) {
  const ip = server.hostSnapshot?.ip
  const os = server.hostSnapshot?.os
  const checkedAt = server.hostSnapshot?.checkedAt

  return (
    <article
      className={`card server-card${selected ? ' is-selected' : ''}${onDetach ? ' has-detach' : ''}`}
      data-entity-id={server.id}
    >
      <button
        type="button"
        className="server-card-body"
        aria-expanded={selected}
        aria-controls="servers-preview"
        onClick={onToggle}
      >
        <span className="server-card-title">
          <span className={`servers-dot ${statusDotClass(server.statusKind)}`} aria-hidden="true" />
          <strong>{server.name}</strong>
          <span className={`badge badge-${server.statusKind}`}>{server.status}</span>
        </span>
        <span className="server-card-kv">
          <span>
            <small>Хост</small>
            <strong>{server.host || '—'}</strong>
          </span>
          {ip ? (
            <span>
              <small>IP</small>
              <strong>{ip}</strong>
            </span>
          ) : null}
          {os ? (
            <span>
              <small>ОС</small>
              <strong>{os}</strong>
            </span>
          ) : null}
          <span>
            <small>Роль</small>
            <strong>{server.role || '—'}</strong>
          </span>
          <span>
            <small>Ресурсы</small>
            <strong>{server.specs || '—'}</strong>
          </span>
          <span>
            <small>Хостер</small>
            <strong>{providerLabel(server)}</strong>
          </span>
          {checkedAt ? (
            <span>
              <small>Проверен</small>
              <strong>{formatCheckedAt(checkedAt)}</strong>
            </span>
          ) : null}
        </span>
      </button>
      <div className="server-card-actions" onClick={(event) => event.stopPropagation()}>
        {onDetach ? (
          <button type="button" className="btn btn-ghost" onClick={onDetach}>
            Открепить
          </button>
        ) : null}
        <button
          type="button"
          className="icon-action icon-action-danger"
          aria-label={`Удалить ${server.name}`}
          title="Удалить из LCC"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <IconTrash />
        </button>
      </div>
    </article>
  )
}

export function ServersListSkeleton() {
  return (
    <div className="servers-list" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="card server-card skeleton-card">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-short" />
        </div>
      ))}
    </div>
  )
}
