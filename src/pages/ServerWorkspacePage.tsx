import { useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ServerConsole } from '../components/servers/ServerConsole'
import { ServerFiles } from '../components/servers/ServerFiles'
import { ServerMonitor } from '../components/servers/ServerMonitor'
import { ServersListSkeleton } from '../components/servers/ServerCard'
import { ServerPowerButtons } from '../components/servers/ServerPowerButtons'
import {
  ServerBackupsTab,
  ServerJournalsTab,
  ServerOverview,
  ServerSettingsTab,
} from '../components/servers/WorkspaceTabs'
import { presentServer, useSpacewebRoster } from '../hosting/sync'
import {
  SERVER_TABS,
  isServerTab,
  serverListPath,
  serverPath,
  type ServerTabId,
} from '../components/servers/serverUi'
import { useCollection } from '../vault/useCollection'

export function ServerWorkspacePage() {
  const { serverId = '', tab } = useParams()
  const navigate = useNavigate()
  const { items, loading } = useCollection('servers')
  const roster = useSpacewebRoster()
  const arrowed = useRef(false)

  const current: ServerTabId = isServerTab(tab) ? tab : 'overview'
  const server = items.find((item) => item.id === serverId)
  const view = useMemo(
    () => (server ? presentServer(server, roster.vps, roster.checkedAt) : null),
    [server, roster.vps, roster.checkedAt],
  )
  const hint = SERVER_TABS.find((item) => item.id === current)?.hint ?? ''

  useEffect(() => {
    if (!arrowed.current) return
    arrowed.current = false
    document.getElementById(`server-tab-${current}`)?.focus()
  }, [current])

  if (!serverId) return <Navigate to="/servers" replace />
  if (tab && !isServerTab(tab)) return <Navigate to={serverPath(serverId, 'overview')} replace />

  if (loading) {
    return (
      <div className="server-workspace">
        <ServersListSkeleton />
      </div>
    )
  }

  if (!server) {
    return (
      <div className="server-workspace">
        <div className="page-head">
          <div>
            <h1>Сервер не найден</h1>
            <p>Такого сервера в списке нет.</p>
          </div>
        </div>
        <div className="card servers-section">
          <p className="servers-note">Проверьте ссылку или вернитесь к списку.</p>
          <Link className="btn btn-ghost" to="/servers">
            К серверам
          </Link>
        </div>
      </div>
    )
  }

  function onTabKey(index: number, key: string) {
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return
    const dir = key === 'ArrowRight' ? 1 : -1
    const next = SERVER_TABS[(index + dir + SERVER_TABS.length) % SERVER_TABS.length]
    arrowed.current = true
    navigate(serverPath(serverId, next.id))
  }

  return (
    <div className="server-workspace">
      <div className="project-tabs" role="tablist" aria-label="Разделы сервера">
        {SERVER_TABS.map((item, index) => {
          const active = item.id === current
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`server-tab-${item.id}`}
              className={`project-tab${active ? ' active' : ''}`}
              aria-selected={active}
              aria-controls={`server-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => navigate(serverPath(server.id, item.id))}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                event.preventDefault()
                onTabKey(index, event.key)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="page-head">
        <div>
          <button
            className="btn btn-ghost detail-back"
            type="button"
            onClick={() => navigate(serverListPath(server.id))}
          >
            ← К серверам
          </button>
          <h1>{server.name}</h1>
          <p>{hint}</p>
        </div>
        <div className="servers-workspace-side">
          {view ? <ServerPowerButtons server={view} onRefresh={roster.refresh} /> : null}
          <span className={`badge badge-${server.statusKind}`}>{server.status}</span>
        </div>
      </div>

      <div
        className="project-tab-stage"
        role="tabpanel"
        id={`server-panel-${current}`}
        aria-labelledby={`server-tab-${current}`}
      >
        {current === 'overview' && view ? (
          <>
            <ServerOverview server={view} />
            <ServerMonitor server={view} />
          </>
        ) : null}
        {current === 'monitoring' && view ? <ServerMonitor server={view} /> : null}
        {current === 'console' && view ? <ServerConsole server={view} /> : null}
        {current === 'files' && view ? <ServerFiles server={view} /> : null}
        {current === 'journals' ? <ServerJournalsTab server={server} /> : null}
        {current === 'backups' ? <ServerBackupsTab server={server} /> : null}
        {current === 'settings' ? (
          <ServerSettingsTab server={server} vps={roster.vps} vpsPhase={roster.phase} />
        ) : null}
      </div>
    </div>
  )
}
