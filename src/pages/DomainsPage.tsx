import { useCallback, useState } from 'react'
import { isApiError } from '../api/errors'
import { useVaultApi } from '../api/useVaultApi'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DomainFormModal, type DomainFormValues } from '../components/DomainFormModal'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import type { Domain } from '../vault/types'
import { useCollection } from '../vault/useCollection'

function failureMessage(error: unknown): string {
  if (isApiError(error) || error instanceof Error) return error.message
  return 'Не удалось сохранить'
}

export function DomainsPage() {
  const { items, loading } = useCollection('domains')
  const api = useVaultApi()
  const { notify } = useToast()
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((domain) => domain.id === id), [items]),
  )

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; domain?: Domain } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Domain | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveDomain(values: DomainFormValues) {
    setBusy(true)
    try {
      const payload = {
        domain: values.domain,
        registrar: values.registrar,
        dns: values.dns,
        expires: values.expires,
        ssl: values.ssl,
        projectId: values.projectId || null,
      }
      if (form?.mode === 'edit' && form.domain) {
        await api.patch('domains', form.domain.id, payload, 'patch')
        notify({ message: `Домен «${values.domain}» обновлён`, tone: 'success' })
      } else {
        await api.create('domains', payload)
        notify({ message: `Домен «${values.domain}» добавлен`, tone: 'success' })
      }
      setForm(null)
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
      const name = confirmDelete.domain
      await api.remove('domains', confirmDelete.id)
      if (form?.domain?.id === confirmDelete.id) setForm(null)
      setConfirmDelete(null)
      notify({ message: `Домен «${name}» удалён`, tone: 'danger' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Домены и DNS</h1>
          <p>Регистраторы, NS, SSL и даты продления</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setForm({ mode: 'create' })}>
          <IconPlus /> Добавить домен
        </button>
      </div>

      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={7} />
        ) : items.length === 0 ? (
          <div className="empty-hint table-empty">Пока нет доменов — добавьте первый</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Домен</th>
                <th>Проект</th>
                <th>Регистратор</th>
                <th>DNS</th>
                <th>SSL</th>
                <th>Продление</th>
                <th className="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((domain) => (
                <tr
                  key={domain.id}
                  data-entity-id={domain.id}
                  className={highlightId === domain.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{domain.domain}</strong>
                  </td>
                  <td>{domain.project}</td>
                  <td>{domain.registrar}</td>
                  <td>{domain.dns}</td>
                  <td>{domain.ssl}</td>
                  <td>{domain.expires}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        title="Редактировать"
                        aria-label={`Редактировать ${domain.domain}`}
                        onClick={() => setForm({ mode: 'edit', domain })}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="icon-action icon-action-danger"
                        type="button"
                        title="Удалить"
                        aria-label={`Удалить ${domain.domain}`}
                        onClick={() => setConfirmDelete(domain)}
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

      <DomainFormModal
        open={Boolean(form)}
        mode={form?.mode ?? 'create'}
        initial={form?.domain}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={saveDomain}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить домен?"
        message={`Домен «${confirmDelete?.domain ?? ''}» будет удалён из vault без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}
