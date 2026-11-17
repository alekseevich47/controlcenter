import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { presentServer, useSpacewebRoster } from '../hosting/sync'
import { parseFocusId } from '../hooks/useSearchFocus'
import { normalizeServer, serverHasProject, serverLinks } from '../vault/serverModel'
import type { Server, ServerProjectLink } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'
import { ConfirmDialog } from './ConfirmDialog'
import { IconPlus } from './Icons'
import { ServerFormModal, type ServerFormValues } from './ServerFormModal'
import { useToast } from './ToastProvider'
import { AttachServersModal } from './servers/AttachServersModal'
import { ServerCard, ServersListSkeleton } from './servers/ServerCard'
import { ServerPreview } from './servers/ServerPreview'
import { ServerStage } from './servers/ServerStage'
import {
  SERVER_LIMITS,
  SERVER_MOTION_MS,
  clip,
  failureMessage,
  orDash,
  prefersReducedMotion,
} from './servers/serverUi'

interface ServersPanelProps {
  /** Если задан — только серверы этого проекта, в том числе вторая привязка. */
  projectId?: string
  title?: string
  subtitle?: string
  compactHead?: boolean
}

export function ServersPanel({
  projectId,
  title = 'Серверы',
  subtitle = 'Хосты, роли и привязки к проектам',
  compactHead = false,
}: ServersPanelProps) {
  const [params, setParams] = useSearchParams()
  const { items, loading } = useCollection('servers')
  const { items: projects } = useCollection('projects')
  const { put, remove } = useVault()
  const { notify } = useToast()
  const roster = useSpacewebRoster()

  const [localOpen, setLocalOpen] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Server | null>(null)
  const [confirmDetach, setConfirmDetach] = useState<Server | null>(null)
  const [busy, setBusy] = useState(false)
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (!projectId) return items
    return items.filter((server) => serverHasProject(server, projectId))
  }, [items, projectId])

  const urlOpen = projectId ? null : parseFocusId(params.get('open'))
  const localMissing =
    Boolean(projectId) &&
    Boolean(localOpen) &&
    !loading &&
    !visible.some((server) => server.id === localOpen)
  const openId = projectId ? (localMissing ? null : localOpen) : urlOpen
  const active = openId ? (visible.find((server) => server.id === openId) ?? null) : null
  const missing = Boolean(openId) && !loading && !active && !projectId
  const held = useHeldServer(active)
  const stageOpen = Boolean(active) || missing
  const shown = active ?? (missing ? null : held)

  const lockedProject = useMemo(() => {
    if (!projectId) return null
    return {
      id: projectId,
      name: projects.find((project) => project.id === projectId)?.name ?? 'этот проект',
    }
  }, [projectId, projects])

  const attachCandidates = useMemo(() => {
    if (!projectId) return []
    return items
      .filter((server) => !serverHasProject(server, projectId))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [items, projectId])

  const overlayOpen = createOpen || attachOpen || Boolean(confirmDelete) || Boolean(confirmDetach)

  useEffect(() => {
    if (!openId || projectId || loading) return
    const node = document.querySelector(`[data-entity-id="${CSS.escape(openId)}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [openId, projectId, loading])

  useEffect(() => {
    if (localMissing) setLocalOpen(null)
  }, [localMissing])

  useEffect(() => {
    if (!openId || overlayOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="alertdialog"]')) return
      if (projectId) {
        setLocalOpen(null)
        return
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('open')
          return next
        },
        { replace: true },
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, overlayOpen, projectId, setParams])

  const shownView = useMemo(
    () => (shown ? presentServer(shown, roster.vps, roster.checkedAt) : null),
    [shown, roster.vps, roster.checkedAt],
  )

  function closePreview() {
    if (projectId) {
      setLocalOpen(null)
      return
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('open')
        return next
      },
      { replace: true },
    )
  }

  function select(id: string | null) {
    if (projectId) {
      setLocalOpen(id)
      return
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('open', id)
        else next.delete('open')
        return next
      },
      { replace: true },
    )
  }

  function toggle(id: string) {
    select(openId === id ? null : id)
  }

  async function saveServer(values: ServerFormValues) {
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const linked = projectId || values.projectId
      const links: ServerProjectLink[] = linked ? [{ projectId: linked }] : []
      const description = clip(values.description, SERVER_LIMITS.description)
      const next = normalizeServer({
        id: `srv-${crypto.randomUUID().slice(0, 8)}`,
        createdAt: now,
        updatedAt: now,
        name: clip(values.name, SERVER_LIMITS.name),
        host: orDash(clip(values.host, SERVER_LIMITS.host)),
        specs: orDash(clip(values.specs, SERVER_LIMITS.specs)),
        role: orDash(clip(values.role, SERVER_LIMITS.role)),
        status: 'Online',
        statusKind: 'green',
        description: description || undefined,
        links,
        projectId: links[0]?.projectId,
      })
      if (!next.name) {
        notify({ message: 'Укажите название сервера', tone: 'danger' })
        return
      }
      await put('servers', next)
      notify({ message: `Сервер «${next.name}» добавлен`, tone: 'success' })
      setCreateOpen(false)
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const name = confirmDelete.name
      const id = confirmDelete.id
      await remove('servers', id)
      if (openId === id) closePreview()
      setConfirmDelete(null)
      notify({ message: `Сервер «${name}» удалён из LCC`, tone: 'danger' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmDetachServer() {
    if (!confirmDetach || !projectId) return
    setBusy(true)
    try {
      const nextLinks = serverLinks(confirmDetach).filter((link) => link.projectId !== projectId)
      await put(
        'servers',
        normalizeServer({
          ...confirmDetach,
          links: nextLinks,
          projectId: nextLinks[0]?.projectId,
          updatedAt: new Date().toISOString(),
        }),
      )
      notify({ message: `«${confirmDetach.name}» откреплён от проекта`, tone: 'success' })
      setConfirmDetach(null)
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function attach(server: Server) {
    if (!projectId || attachBusyId) return
    setAttachBusyId(server.id)
    try {
      const nextLinks = [...serverLinks(server), { projectId }]
      await put(
        'servers',
        normalizeServer({
          ...server,
          links: nextLinks,
          projectId: nextLinks[0]?.projectId,
          updatedAt: new Date().toISOString(),
        }),
      )
      notify({ message: `«${server.name}» прикреплён к проекту`, tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setAttachBusyId(null)
    }
  }

  const preview = shownView ? (
    <ServerPreview server={shownView} onRefresh={roster.refresh} />
  ) : missing ? (
    <div className="servers-missing-preview">
      <strong>Сервер не найден</strong>
      <p className="servers-note">В списке нет такой карточки.</p>
      <button type="button" className="btn btn-ghost" onClick={closePreview}>
        Закрыть
      </button>
    </div>
  ) : null

  return (
    <div className="servers-panel">
      <div className={`page-head${compactHead ? ' page-head-compact' : ''}`}>
        <div>
          {!compactHead ? <h1>{title}</h1> : null}
          {compactHead ? <h2 className="panel-title">{title}</h2> : null}
          <p>{subtitle}</p>
        </div>
        <div className="servers-head-actions">
          {projectId ? (
            <button className="btn btn-ghost" type="button" onClick={() => setAttachOpen(true)}>
              Прикрепить
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>
            <IconPlus /> {projectId ? 'Добавить' : 'Добавить сервер'}
          </button>
        </div>
      </div>

      {loading ? (
        <ServersListSkeleton />
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty-hint">Пока нет серверов — добавьте первый</div>
        </div>
      ) : (
        <ServerStage open={stageOpen} preview={preview}>
          {visible.map((server) => (
            <ServerCard
              key={server.id}
              server={presentServer(server, roster.vps, roster.checkedAt)}
              selected={server.id === openId}
              onToggle={() => toggle(server.id)}
              onDelete={() => setConfirmDelete(server)}
              onDetach={projectId ? () => setConfirmDetach(server) : undefined}
            />
          ))}
        </ServerStage>
      )}

      <ServerFormModal
        open={createOpen}
        busy={busy}
        lockedProject={lockedProject}
        onClose={() => setCreateOpen(false)}
        onSubmit={saveServer}
      />

      <AttachServersModal
        open={attachOpen}
        servers={attachCandidates}
        busyId={attachBusyId}
        onClose={() => setAttachOpen(false)}
        onAttach={(server) => void attach(server)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить сервер?"
        message={`Сервер «${confirmDelete?.name ?? ''}» будет удалён только из LCC. Машина у хостера не удаляется.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmPurge()}
      />

      <ConfirmDialog
        open={Boolean(confirmDetach)}
        title="Открепить сервер?"
        message={`«${confirmDetach?.name ?? ''}» останется в LCC. Снимется только привязка к этому проекту.`}
        confirmLabel="Открепить"
        busy={busy}
        onCancel={() => setConfirmDetach(null)}
        onConfirm={() => void confirmDetachServer()}
      />
    </div>
  )
}

function useHeldServer(server: Server | null): Server | null {
  const [held, setHeld] = useState<Server | null>(server)
  if (server && held !== server) setHeld(server)

  useEffect(() => {
    if (server) return
    const timer = window.setTimeout(
      () => setHeld(null),
      prefersReducedMotion() ? 0 : SERVER_MOTION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [server])

  return server ?? held
}
