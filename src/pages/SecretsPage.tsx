import { useCallback, useState } from 'react'
import { isApiError } from '../api/errors'
import { useVaultApi } from '../api/useVaultApi'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { SecretFormModal, type SecretFormValues } from '../components/SecretFormModal'
import { SecretsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import type { SecretRef } from '../vault/types'
import { useCollection } from '../vault/useCollection'

export function SecretsPage() {
  const { items, loading } = useCollection('secrets')
  const api = useVaultApi()
  const { notify } = useToast()
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; secret?: SecretRef } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SecretRef | null>(null)
  const [busy, setBusy] = useState(false)

  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((secret) => secret.id === id), [items]),
  )

  async function save(values: SecretFormValues) {
    const name = values.name
    const place = values.place
    const projectId = values.projectId
    setBusy(true)
    try {
      if (form?.mode === 'edit' && form.secret) {
        await api.patch('secrets', form.secret.id, { name, place, projectId: projectId || null }, 'patch')
        notify({ message: `Ссылка «${name}» обновлена`, tone: 'success' })
      } else {
        await api.create('secrets', { name, place, projectId: projectId || null })
        notify({ message: `Ссылка «${name}» добавлена`, tone: 'success' })
      }
      setForm(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove() {
    if (!pendingDelete) return
    const id = pendingDelete.id
    const name = pendingDelete.name
    setBusy(true)
    try {
      await api.remove('secrets', id)
      setPendingDelete(null)
      notify({ message: `Ссылка «${name}» удалена`, tone: 'danger' })
    } catch (error) {
      const message = isApiError(error) || error instanceof Error ? error.message : 'Не удалось удалить ссылку'
      notify({ message, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Секреты</h1>
          <p>В LCC — только ссылки и расположение. Значения в зашифрованных файлах vault</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setForm({ mode: 'create' })}>
          <IconPlus /> Добавить ссылку
        </button>
      </div>

      {loading ? (
        <SecretsSkeleton />
      ) : items.length === 0 ? (
        <div className="card empty-hint">Пока нет ссылок на секреты — добавьте первую</div>
      ) : (
        <div className="card">
          {items.map((secret) => (
            <div
              className={`secret-row${highlightId === secret.id ? ' entity-focus' : ''}`}
              key={secret.id}
              data-entity-id={secret.id}
            >
              <div>
                <strong>{secret.name}</strong>
                <div className="mono">{secret.place}</div>
              </div>
              <div className="row-actions">
                <span className="badge badge-lime">{secret.project}</span>
                <button
                  className="icon-action"
                  type="button"
                  title="Редактировать"
                  aria-label={`Редактировать ${secret.name}`}
                  disabled={busy}
                  onClick={() => setForm({ mode: 'edit', secret })}
                >
                  <IconEdit />
                </button>
                <button
                  className="icon-action icon-action-danger"
                  type="button"
                  title="Удалить"
                  aria-label={`Удалить ссылку ${secret.name}`}
                  disabled={busy}
                  onClick={() => setPendingDelete(secret)}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SecretFormModal
        open={form !== null}
        mode={form?.mode ?? 'create'}
        initial={form?.secret}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={save}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить ссылку?"
        message={`Ссылка «${pendingDelete?.name ?? ''}» будет удалена из vault. Значение секрета в LCC не хранится и не удаляется.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}
