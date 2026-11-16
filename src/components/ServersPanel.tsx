import { useCallback, useMemo, useState } from 'react'
import { useSearchFocus } from '../hooks/useSearchFocus'
import { isServerRunning, serverStatusKind } from '../vault/serverStatus'
import type { Server } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'
import { ConfirmDialog } from './ConfirmDialog'
import { IconEdit, IconPlay, IconPlus, IconPower, IconTrash } from './Icons'
import { ServerFormModal, type ServerFormValues } from './ServerFormModal'
import { TableSkeleton } from './Skeleton'
import { useToast } from './ToastProvider'

interface ServersPanelProps {
  /** Если задан — показываем только серверы проекта и пишем projectId при создании */
  projectId?: string
  title?: string
  subtitle?: string
  compactHead?: boolean
}

export function ServersPanel({
  projectId,
  title = 'Серверы',
  subtitle = 'Хосты, роли, ресурсы и статус мониторинга',
  compactHead = false,
}: ServersPanelProps) {
  const { items, loading } = useCollection('servers')
  const { put, remove } = useVault()
  const { notify } = useToast()

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; server?: Server } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Server | null>(null)
  const [busy, setBusy] = useState(false)
  const [powerBusyId, setPowerBusyId] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (!projectId) return items
    return items.filter((s) => s.projectId === projectId)
  }, [items, projectId])

  const openFromSearch = useCallback(
    (id: string) => {
      // Deep-link только на глобальной странице /servers (не во вкладке проекта)
      if (projectId) return
      const server = items.find((s) => s.id === id)
      if (!server) return
      setForm({ mode: 'edit', server })
    },
    [items, projectId],
  )

  useSearchFocus({ ready: !loading && !projectId, onFocus: openFromSearch })

  async function saveServer(values: ServerFormValues) {
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const kind = serverStatusKind(values.status)
      if (form?.mode === 'edit' && form.server) {
        const next: Server = {
          ...form.server,
          name: values.name,
          host: values.host,
          specs: values.specs,
          role: values.role,
          status: values.status,
          statusKind: kind,
          updatedAt: now,
        }
        await put('servers', next)
        notify({ message: `Сервер «${next.name}» обновлён`, tone: 'success' })
      } else {
        const id = `srv-${crypto.randomUUID().slice(0, 8)}`
        const next: Server = {
          id,
          createdAt: now,
          updatedAt: now,
          name: values.name,
          host: values.host,
          specs: values.specs,
          role: values.role,
          status: values.status,
          statusKind: kind,
          ...(projectId ? { projectId } : {}),
        }
        await put('servers', next)
        notify({ message: `Сервер «${next.name}» добавлен`, tone: 'success' })
      }
      setForm(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const name = confirmDelete.name
      await remove('servers', confirmDelete.id)
      setConfirmDelete(null)
      notify({ message: `Сервер «${name}» удалён`, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function togglePower(server: Server) {
    if (powerBusyId) return
    setPowerBusyId(server.id)
    try {
      const running = isServerRunning(server.status, server.statusKind)
      const next: Server = {
        ...server,
        status: running ? 'Offline' : 'Online',
        statusKind: running ? 'red' : 'green',
        updatedAt: new Date().toISOString(),
      }
      await put('servers', next)
      notify({
        message: running
          ? `«${server.name}» выключен (заглушка)`
          : `«${server.name}» включён (заглушка)`,
        tone: 'info',
      })
    } finally {
      setPowerBusyId(null)
    }
  }

  return (
    <>
      <div className={`page-head${compactHead ? ' page-head-compact' : ''}`}>
        <div>
          {!compactHead && <h1>{title}</h1>}
          {compactHead ? <h2 className="panel-title">{title}</h2> : null}
          <p>{subtitle}</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setForm({ mode: 'create' })}
        >
          <IconPlus /> Добавить сервер
        </button>
      </div>

      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : visible.length === 0 ? (
          <div className="empty-hint table-empty">Пока нет серверов — добавьте первый</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Сервер</th>
                <th>Хост</th>
                <th>Ресурсы</th>
                <th>Роль</th>
                <th>Статус</th>
                <th className="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const running = isServerRunning(s.status, s.statusKind)
                const powerDisabled = powerBusyId === s.id
                return (
                  <tr key={s.id} data-entity-id={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.host}</td>
                    <td>{s.specs}</td>
                    <td>{s.role}</td>
                    <td>
                      <span className={`badge badge-${s.statusKind}`}>{s.status}</span>
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          className="icon-action"
                          type="button"
                          title="Редактировать"
                          aria-label={`Редактировать ${s.name}`}
                          onClick={() => setForm({ mode: 'edit', server: s })}
                        >
                          <IconEdit />
                        </button>
                        <button
                          className="icon-action icon-action-danger"
                          type="button"
                          title="Удалить"
                          aria-label={`Удалить ${s.name}`}
                          onClick={() => setConfirmDelete(s)}
                        >
                          <IconTrash />
                        </button>
                        <button
                          className={`icon-action ${running ? 'icon-action-danger' : 'icon-action-success'}`}
                          type="button"
                          title={running ? 'Выключить (заглушка)' : 'Включить (заглушка)'}
                          aria-label={
                            running ? `Выключить ${s.name}` : `Включить ${s.name}`
                          }
                          disabled={powerDisabled}
                          onClick={() => void togglePower(s)}
                        >
                          {running ? <IconPower /> : <IconPlay />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ServerFormModal
        open={Boolean(form)}
        mode={form?.mode ?? 'create'}
        initial={form?.server}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={saveServer}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить сервер?"
        message={`Сервер «${confirmDelete?.name ?? ''}» будет удалён из vault без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}
