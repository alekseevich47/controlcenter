import { useCallback, useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconPin, IconPlus } from '../components/Icons'
import { ProjectContextMenu, type ProjectMenuAction } from '../components/ProjectContextMenu'
import { ProjectDetail } from '../components/ProjectDetail'
import { ProjectFormModal, type ProjectFormValues } from '../components/ProjectFormModal'
import { CardsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchFocus } from '../hooks/useSearchFocus'
import {
  ACTIVE_PROJECT_STATUSES,
  applyStatus,
  archiveProject,
  badgeClass,
  isArchived,
  normalizeProjectStatus,
  statusKindFor,
  unarchiveProject,
  type ProjectStatus,
} from '../vault/projectStatus'
import { syncClientsForProject } from '../vault/clientProjects'
import type { Project } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'

type Section = 'active' | 'archive'

type MenuState = { project: Project; x: number; y: number } | null

export function ProjectsPage() {
  const { items, loading } = useCollection('projects')
  const { items: clients, loading: clientsLoading } = useCollection('clients')
  const { put, remove } = useVault()
  const { notify } = useToast()

  const [section, setSection] = useState<Section>('active')
  const [filters, setFilters] = useState<Set<ProjectStatus>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; project?: Project } | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId],
  )

  const openFromSearch = useCallback(
    (id: string) => {
      const project = items.find((p) => p.id === id)
      if (!project) return
      if (isArchived(project)) {
        setSection('archive')
        setFilters(new Set())
      } else {
        setSection('active')
      }
      setSelectedId(project.id)
    },
    [items],
  )

  useSearchFocus({ ready: !loading, onFocus: openFromSearch })

  const { active, archive } = useMemo(() => {
    const a: Project[] = []
    const ar: Project[] = []
    for (const p of items) {
      if (isArchived(p)) ar.push(p)
      else a.push(p)
    }
    const sortPinned = (list: Project[]) =>
      [...list].sort((x, y) => {
        const pin = Number(Boolean(y.pinned)) - Number(Boolean(x.pinned))
        if (pin !== 0) return pin
        return y.updatedAt.localeCompare(x.updatedAt)
      })
    return { active: sortPinned(a), archive: sortPinned(ar) }
  }, [items])

  const visible = useMemo(() => {
    const source = section === 'archive' ? archive : active
    if (section === 'archive' || filters.size === 0) return source
    return source.filter((p) => filters.has(normalizeProjectStatus(p.status)))
  }, [section, archive, active, filters])

  function toggleFilter(status: ProjectStatus) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  async function saveProject(values: ProjectFormValues) {
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const prevClientId =
        form?.mode === 'edit' && form.project ? form.project.clientId : null

      let next: Project
      if (form?.mode === 'edit' && form.project) {
        next = {
          ...form.project,
          name: values.name,
          status: values.status,
          statusKind: statusKindFor(values.status),
          stack: values.stack,
          client: values.client,
          clientId: values.clientId,
          domain: values.domain,
          note: values.note,
          updatedAt: now,
        }
        await put('projects', next)
        notify({ message: `Проект «${next.name}» обновлён`, tone: 'success' })
      } else {
        const id = `p-${crypto.randomUUID().slice(0, 8)}`
        next = {
          id,
          createdAt: now,
          updatedAt: now,
          name: values.name,
          status: values.status,
          statusKind: statusKindFor(values.status),
          stack: values.stack,
          client: values.client,
          clientId: values.clientId,
          domain: values.domain,
          note: values.note,
          pinned: false,
          deletedAt: null,
        }
        await put('projects', next)
        notify({ message: `Проект «${next.name}» создан`, tone: 'success' })
      }

      await syncClientsForProject(next, prevClientId, clients, items, put)
      setSelectedId(next.id)
      setForm(null)
    } finally {
      setBusy(false)
    }
  }

  async function patchProject(project: Project, patch: Partial<Project>, toast?: string) {
    await put('projects', { ...project, ...patch, updatedAt: new Date().toISOString() })
    if (toast) notify({ message: toast, tone: 'success' })
  }

  async function toggleArchive(project: Project) {
    if (isArchived(project)) {
      await put('projects', unarchiveProject(project))
      notify({ message: `«${project.name}» возвращён из архива`, tone: 'success' })
    } else {
      await put('projects', archiveProject(project))
      notify({ message: `«${project.name}» перемещён в архив`, tone: 'info' })
      if (selectedId === project.id) setSelectedId(null)
    }
  }

  async function handleMenuAction(action: ProjectMenuAction) {
    if (!menu) return
    const project = menu.project
    setMenu(null)

    if (action.type === 'edit') {
      setForm({ mode: 'edit', project })
      return
    }
    if (action.type === 'pin') {
      const pinned = !project.pinned
      await patchProject(
        project,
        { pinned },
        pinned ? `«${project.name}» закреплён` : `«${project.name}» откреплён`,
      )
      return
    }
    if (action.type === 'archive') {
      await toggleArchive(project)
      return
    }
    if (action.type === 'delete') {
      setConfirmDelete(project)
      return
    }
    if (action.type === 'status') {
      await put('projects', applyStatus(project, action.status))
      notify({ message: `Статус «${project.name}»: ${action.status}`, tone: 'success' })
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const name = confirmDelete.name
      await remove('projects', confirmDelete.id)
      if (selectedId === confirmDelete.id) setSelectedId(null)
      setConfirmDelete(null)
      notify({ message: `Проект «${name}» удалён`, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(confirmDelete)}
      title="Удалить проект?"
      message={`Проект «${confirmDelete?.name ?? ''}» будет удалён из vault без возможности восстановления.`}
      confirmLabel="Удалить"
      danger
      busy={busy}
      onCancel={() => setConfirmDelete(null)}
      onConfirm={() => void confirmPurge()}
    />
  )

  const formModal = (
    <ProjectFormModal
      open={Boolean(form)}
      mode={form?.mode ?? 'create'}
      initial={form?.project}
      clients={clients}
      busy={busy || clientsLoading}
      onClose={() => setForm(null)}
      onSubmit={saveProject}
    />
  )

  if (selected) {
    return (
      <>
        <ProjectDetail
          key={selected.id}
          project={selected}
          onBack={() => setSelectedId(null)}
          onEdit={() => setForm({ mode: 'edit', project: selected })}
          onTogglePin={() =>
            void patchProject(
              selected,
              { pinned: !selected.pinned },
              selected.pinned
                ? `«${selected.name}» откреплён`
                : `«${selected.name}» закреплён`,
            )
          }
          onToggleArchive={() => void toggleArchive(selected)}
          onDelete={() => setConfirmDelete(selected)}
        />
        {formModal}
        {confirmDialog}
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Проекты</h1>
          <p>Паспорта продуктов: стек, окружения, клиент и статус</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setForm({ mode: 'create' })}
        >
          <IconPlus /> Новый проект
        </button>
      </div>

      <div className="filters section-tabs">
        <button
          className={`chip${section === 'active' ? ' active' : ''}`}
          type="button"
          onClick={() => setSection('active')}
        >
          Проекты
          <span className="chip-count">{active.length}</span>
        </button>
        <button
          className={`chip${section === 'archive' ? ' active' : ''}`}
          type="button"
          onClick={() => {
            setSection('archive')
            setFilters(new Set())
          }}
        >
          Архив
          <span className="chip-count">{archive.length}</span>
        </button>
      </div>

      {section === 'active' && (
        <div className="filters badge-filters" role="group" aria-label="Фильтр по статусу">
          <button
            className={`chip${filters.size === 0 ? ' active' : ''}`}
            type="button"
            onClick={() => setFilters(new Set())}
          >
            Все
          </button>
          {ACTIVE_PROJECT_STATUSES.map((status) => {
            const kind = statusKindFor(status)
            const on = filters.has(status)
            return (
              <button
                key={status}
                className={`chip badge-chip ${badgeClass(kind)}${on ? ' active' : ''}`}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFilter(status)}
              >
                {status}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <CardsSkeleton />
      ) : visible.length === 0 ? (
        <div className="card empty-hint">
          {section === 'archive'
            ? 'Архив пуст'
            : filters.size > 0
              ? 'Нет проектов с выбранными статусами'
              : 'Пока нет проектов — создайте первый'}
        </div>
      ) : (
        <div className="grid-cards">
          {visible.map((p) => {
            const status = normalizeProjectStatus(p.status)
            const kind = statusKindFor(status)
            return (
              <article
                key={p.id}
                className={`card entity-card project-card${p.pinned ? ' pinned' : ''}`}
                tabIndex={0}
                role="button"
                onClick={() => setSelectedId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(p.id)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ project: p, x: e.clientX, y: e.clientY })
                }}
              >
                <div className="top">
                  <h3>
                    {p.pinned && (
                      <span className="pin-inline" title="Закреплён">
                        <IconPin />
                      </span>
                    )}
                    {p.name}
                  </h3>
                  <span className={`badge ${badgeClass(kind)}`}>
                    {status === 'Удален' ? 'Архив' : status}
                  </span>
                </div>
                <p>{p.note}</p>
                <div className="kv">
                  <div>
                    <small>Клиент</small>
                    <strong>{p.client}</strong>
                  </div>
                  <div>
                    <small>Домен</small>
                    <strong>{p.domain}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <small>Стек</small>
                    <strong>{p.stack}</strong>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {menu && (
        <ProjectContextMenu
          project={menu.project}
          x={menu.x}
          y={menu.y}
          archivedView={section === 'archive'}
          onClose={() => setMenu(null)}
          onAction={(a) => void handleMenuAction(a)}
        />
      )}

      {formModal}
      {confirmDialog}
    </>
  )
}
