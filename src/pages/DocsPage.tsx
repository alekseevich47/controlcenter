import { useCallback, useState } from 'react'
import { DocFormModal, type DocFormValues } from '../components/DocFormModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { CardsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import { useVaultApi } from '../api/useVaultApi'
import type { Doc } from '../vault/types'
import { useCollection } from '../vault/useCollection'

const PREVIEW_LEN = 140

function bodyPreview(body: string | undefined): string {
  const text = body ?? ''
  if (!text.trim()) return 'Нет текста'
  if (text.length <= PREVIEW_LEN) return text
  return `${text.slice(0, PREVIEW_LEN).trimEnd()}…`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function DocsPage() {
  const { items, loading } = useCollection('docs')
  const api = useVaultApi()
  const { notify } = useToast()
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((doc) => doc.id === id), [items]),
  )

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; doc?: Doc } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Doc | null>(null)
  const [busy, setBusy] = useState(false)

  function openEdit(doc: Doc) {
    setForm({ mode: 'edit', doc })
  }

  async function saveDoc(values: DocFormValues) {
    const { title, type, body, projectId } = values
    setBusy(true)
    try {
      if (form?.mode === 'edit' && form.doc) {
        const id = form.doc.id
        await api.patch('docs', id, { title, type, body, projectId: projectId || null }, 'patch')
        notify({ message: `Документ «${title}» обновлён`, tone: 'success' })
      } else {
        await api.create('docs', { title, type, body, projectId: projectId || null })
        notify({ message: `Документ «${title}» создан`, tone: 'success' })
      }
      setForm(null)
    } catch (error) {
      notify({ message: errorMessage(error, 'Не удалось сохранить документ'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    const id = confirmDelete.id
    const title = confirmDelete.title
    setBusy(true)
    try {
      await api.remove('docs', id)
      if (form?.doc?.id === id) setForm(null)
      setConfirmDelete(null)
      notify({ message: `Документ «${title}» удалён`, tone: 'danger' })
    } catch (error) {
      notify({ message: errorMessage(error, 'Не удалось удалить документ'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Документация</h1>
          <p>Инструкции, договоры и ops-доки по проектам</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setForm({ mode: 'create' })}>
          <IconPlus /> Новый документ
        </button>
      </div>

      {loading ? (
        <CardsSkeleton count={4} />
      ) : items.length === 0 ? (
        <div className="card empty-hint">Пока нет документов — создайте первый</div>
      ) : (
        <div className="grid-cards">
          {items.map((doc) => (
            <article
              key={doc.id}
              data-entity-id={doc.id}
              className={`card entity-card project-card${highlightId === doc.id ? ' entity-focus' : ''}`}
              onClick={() => openEdit(doc)}
            >
              <div className="top">
                <h3>{doc.title}</h3>
                <span className="badge badge-lime">{doc.type}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{bodyPreview(doc.body)}</p>
              <div className="kv">
                <div>
                  <small>Проект</small>
                  <strong>{doc.project || '—'}</strong>
                </div>
                <div>
                  <small>Обновлено</small>
                  <strong>{new Date(doc.updatedAt).toLocaleString('ru-RU')}</strong>
                </div>
              </div>
              <div className="row-actions" style={{ alignSelf: 'flex-end' }}>
                <button
                  className="icon-action"
                  type="button"
                  title="Редактировать"
                  aria-label={`Редактировать ${doc.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    openEdit(doc)
                  }}
                >
                  <IconEdit />
                </button>
                <button
                  className="icon-action icon-action-danger"
                  type="button"
                  title="Удалить"
                  aria-label={`Удалить ${doc.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setConfirmDelete(doc)
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <DocFormModal
        open={Boolean(form)}
        mode={form?.mode ?? 'create'}
        initial={form?.doc}
        busy={busy}
        onClose={() => {
          if (!busy) setForm(null)
        }}
        onSubmit={saveDoc}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить документ?"
        message={`Документ «${confirmDelete?.title ?? ''}» будет удалён из vault без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(null)
        }}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}
