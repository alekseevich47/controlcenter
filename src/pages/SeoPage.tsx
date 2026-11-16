import { useCallback, useState } from 'react'
import { useVaultApi } from '../api/useVaultApi'
import { CampaignFormModal, type CampaignFormValues } from '../components/CampaignFormModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import type { Campaign } from '../vault/types'
import { useCollection } from '../vault/useCollection'

type Editor = { mode: 'create' | 'edit'; entry?: Campaign } | null

function channelLabel(channel: Campaign['channel']): string {
  if (channel === 'seo') return 'SEO'
  if (channel === 'ads') return 'Реклама'
  return '—'
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function SeoPage() {
  const { items, loading } = useCollection('campaigns')
  const api = useVaultApi()
  const { notify } = useToast()
  const [editor, setEditor] = useState<Editor>(null)
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null)
  const [busy, setBusy] = useState(false)
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((c) => c.id === id), [items]),
  )

  async function saveCampaign(values: CampaignFormValues) {
    const name = values.name.trim()
    if (!name) {
      notify({ message: 'Укажите название кампании', tone: 'danger' })
      return
    }
    if (values.statusKind !== 'green' && values.statusKind !== 'amber') {
      notify({ message: 'Цвет статуса: зелёный или янтарный', tone: 'danger' })
      return
    }
    if (values.channel !== 'seo' && values.channel !== 'ads') {
      notify({ message: 'Выберите канал: SEO или реклама', tone: 'danger' })
      return
    }
    const payload = {
      name,
      platform: values.platform,
      budget: values.budget,
      status: values.status,
      statusKind: values.statusKind,
      channel: values.channel,
      projectId: values.projectId || null,
    }
    setBusy(true)
    try {
      if (editor?.mode === 'edit' && editor.entry) {
        await api.patch('campaigns', editor.entry.id, payload, 'patch')
        notify({ message: `Кампания «${name}» обновлена`, tone: 'success' })
      } else {
        await api.create('campaigns', payload)
        notify({ message: `Кампания «${name}» создана`, tone: 'success' })
      }
      setEditor(null)
    } catch (error) {
      notify({ message: errorText(error, 'Не удалось сохранить кампанию'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const name = confirmDelete.name
      await api.remove('campaigns', confirmDelete.id)
      setConfirmDelete(null)
      notify({ message: `Кампания «${name}» удалена`, tone: 'danger' })
    } catch (error) {
      notify({ message: errorText(error, 'Не удалось удалить кампанию'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SEO и реклама</h1>
          <p>Кампании, позиции и заметки по продвижению</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() => setEditor({ mode: 'create' })}
        >
          <IconPlus /> Новая кампания
        </button>
      </div>

      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={7} />
        ) : items.length === 0 ? (
          <div className="empty-hint table-empty">Пока нет кампаний — создайте первую</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Кампания</th>
                <th>Площадка</th>
                <th>Проект</th>
                <th>Бюджет</th>
                <th>Статус</th>
                <th>Канал</th>
                <th className="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  data-entity-id={c.id}
                  className={highlightId === c.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.platform}</td>
                  <td>{c.project}</td>
                  <td>{c.budget}</td>
                  <td>
                    <span className={`badge badge-${c.statusKind}`}>{c.status}</span>
                  </td>
                  <td>{channelLabel(c.channel)}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        title="Редактировать"
                        aria-label={`Редактировать ${c.name}`}
                        disabled={busy}
                        onClick={() => setEditor({ mode: 'edit', entry: c })}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="icon-action icon-action-danger"
                        type="button"
                        title="Удалить"
                        aria-label={`Удалить ${c.name}`}
                        disabled={busy}
                        onClick={() => setConfirmDelete(c)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CampaignFormModal
        open={editor !== null}
        mode={editor?.mode ?? 'create'}
        initial={editor?.entry}
        busy={busy}
        onClose={() => setEditor(null)}
        onSubmit={saveCampaign}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Удалить кампанию?"
        message={`Кампания «${confirmDelete?.name ?? ''}» будет удалена из vault без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}
