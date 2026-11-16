import { useCallback, useMemo, useState } from 'react'
import { ClientContextMenu, type ClientMenuAction } from '../components/ClientContextMenu'
import { ClientDetail } from '../components/ClientDetail'
import { ClientFormModal, type ClientFormValues } from '../components/ClientFormModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconPlus } from '../components/Icons'
import { CardsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchFocus } from '../hooks/useSearchFocus'
import {
  contactsSummary,
  emptyContacts,
  normalizeClient,
  primaryContactLine,
} from '../vault/clientContacts'
import { projectNamesForClient, syncProjectsForClient } from '../vault/clientProjects'
import type { Client } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'

type MenuState = { client: Client; x: number; y: number } | null

export function ClientsPage() {
  const { items, loading } = useCollection('clients')
  const { items: projects, loading: projectsLoading } = useCollection('projects')
  const { put, remove } = useVault()
  const { notify } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; client?: Client } | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null)
  const [busy, setBusy] = useState(false)

  const clients = useMemo(
    () =>
      [...items]
        .map(normalizeClient)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items],
  )

  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  )

  const openFromSearch = useCallback(
    (id: string) => {
      const client = clients.find((c) => c.id === id)
      if (!client) return false
      setSelectedId(client.id)
    },
    [clients],
  )

  useSearchFocus({ ready: !loading, onFocus: openFromSearch })

  async function saveClient(values: ClientFormValues) {
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const projectIds = values.projectIds
      let next: Client

      if (form?.mode === 'edit' && form.client) {
        const base = normalizeClient(form.client)
        next = {
          id: base.id,
          createdAt: base.createdAt,
          updatedAt: now,
          name: values.name,
          note: values.note,
          contacts: base.contacts,
          tags: base.tags,
          notes: base.notes,
          projectId: base.projectId,
          projectIds: projectIds.length > 0 ? projectIds : undefined,
          projects: projectNamesForClient(
            { ...base, projectIds },
            projects,
          ),
        }
        if (next.projects === '—') delete next.projects
      } else {
        const id = `cl-${crypto.randomUUID().slice(0, 8)}`
        next = {
          id,
          createdAt: now,
          updatedAt: now,
          name: values.name,
          note: values.note,
          contacts: emptyContacts(),
          projectIds: projectIds.length > 0 ? projectIds : undefined,
        }
        const summary = projectNamesForClient(next, projects)
        if (summary !== '—') next.projects = summary
      }

      await put('clients', next)
      await syncProjectsForClient(next, projects, put)
      setSelectedId(next.id)
      notify({
        message:
          form?.mode === 'edit'
            ? `Клиент «${next.name}» обновлён`
            : `Клиент «${next.name}» создан`,
        tone: 'success',
      })
      setForm(null)
    } finally {
      setBusy(false)
    }
  }

  async function saveDetail(next: Client) {
    setBusy(true)
    try {
      await put('clients', normalizeClient(next))
    } finally {
      setBusy(false)
    }
  }

  async function handleMenuAction(action: ClientMenuAction) {
    if (!menu) return
    const client = menu.client
    setMenu(null)

    if (action.type === 'open') {
      setSelectedId(client.id)
      return
    }
    if (action.type === 'edit') {
      setForm({ mode: 'edit', client })
      return
    }
    if (action.type === 'delete') {
      setConfirmDelete(client)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const doomed = normalizeClient(confirmDelete)
      // отвязать проекты
      await syncProjectsForClient(
        { ...doomed, projectIds: undefined },
        projects,
        put,
      )
      const name = doomed.name
      await remove('clients', doomed.id)
      if (selectedId === doomed.id) setSelectedId(null)
      setConfirmDelete(null)
      notify({ message: `Клиент «${name}» удалён`, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(confirmDelete)}
      title="Удалить клиента?"
      message={`Клиент «${confirmDelete?.name ?? ''}» будет удалён из vault без возможности восстановления.`}
      confirmLabel="Удалить"
      danger
      busy={busy}
      onCancel={() => setConfirmDelete(null)}
      onConfirm={() => void confirmPurge()}
    />
  )

  const formModal = (
    <ClientFormModal
      open={Boolean(form)}
      mode={form?.mode ?? 'create'}
      initial={form?.client}
      projects={projects}
      busy={busy || projectsLoading}
      onClose={() => setForm(null)}
      onSubmit={saveClient}
    />
  )

  if (selected) {
    return (
      <>
        <ClientDetail
          key={selected.id}
          client={selected}
          projects={projects}
          busy={busy}
          onBack={() => setSelectedId(null)}
          onEdit={() => setForm({ mode: 'edit', client: selected })}
          onDelete={() => setConfirmDelete(selected)}
          onSave={saveDetail}
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
          <h1>Клиенты</h1>
          <p>Контакты, каналы связи и привязанные проекты</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setForm({ mode: 'create' })}
        >
          <IconPlus /> Новый клиент
        </button>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : clients.length === 0 ? (
        <div className="card empty-hint">Пока нет клиентов — создайте первого</div>
      ) : (
        <div className="grid-cards">
          {clients.map((c) => {
            const channels = contactsSummary(c.contacts)
            const contactLine = primaryContactLine(c)
            const projectLine = projectNamesForClient(c, projects)
            return (
              <article
                key={c.id}
                data-entity-id={c.id}
                className="card entity-card project-card client-card"
                tabIndex={0}
                role="button"
                onClick={() => setSelectedId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(c.id)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ client: c, x: e.clientX, y: e.clientY })
                }}
              >
                <div className="top">
                  <h3>{c.name}</h3>
                  <span className="badge badge-lime">клиент</span>
                </div>
                <p className="client-card-note">{c.note || 'Без заметки'}</p>
                <div className="kv">
                  <div>
                    <small>Контакт</small>
                    <strong>{contactLine}</strong>
                  </div>
                  <div>
                    <small>Каналы</small>
                    <strong>{channels}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <small>Id</small>
                    <strong className="client-card-id">{c.id}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <small>Проекты</small>
                    <strong>{projectLine}</strong>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {menu && (
        <ClientContextMenu
          client={menu.client}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onAction={(a) => void handleMenuAction(a)}
        />
      )}

      {formModal}
      {confirmDialog}
    </>
  )
}
