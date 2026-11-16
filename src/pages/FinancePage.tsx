import { useCallback, useState } from 'react'
import { useVaultApi } from '../api/useVaultApi'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FinanceFormModal, type FinanceFormValues } from '../components/FinanceFormModal'
import { IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import type { FinanceEntry } from '../vault/types'
import { useCollection } from '../vault/useCollection'

type Editor = { mode: 'create' | 'edit'; entry?: FinanceEntry } | null

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function FinancePage() {
  const { items, loading } = useCollection('finance')
  const api = useVaultApi()
  const { notify } = useToast()
  const [editor, setEditor] = useState<Editor>(null)
  const [confirmDelete, setConfirmDelete] = useState<FinanceEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((row) => row.id === id), [items]),
  )
  const total = items.reduce((sum, row) => sum + row.amount, 0)

  async function saveExpense(values: FinanceFormValues) {
    const title = values.title.trim()
    const amount = Number(values.amount)
    if (!title || !Number.isFinite(amount)) {
      notify({
        message: !title ? 'Укажите название' : 'Сумма должна быть числом',
        tone: 'danger',
      })
      return
    }
    const payload = {
      title,
      category: values.category,
      amount: Number(amount),
      date: values.date,
      projectId: values.projectId || null,
    }
    setBusy(true)
    try {
      if (editor?.mode === 'edit' && editor.entry) {
        await api.patch('finance', editor.entry.id, payload, 'patch')
        notify({ message: `Расход «${title}» обновлён`, tone: 'success' })
      } else {
        await api.create('finance', payload)
        notify({ message: `Расход «${title}» добавлен`, tone: 'success' })
      }
      setEditor(null)
    } catch (error) {
      notify({ message: errorText(error, 'Не удалось сохранить расход'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const title = confirmDelete.title
      await api.remove('finance', confirmDelete.id)
      setConfirmDelete(null)
      notify({ message: `Расход «${title}» удалён`, tone: 'danger' })
    } catch (error) {
      notify({ message: errorText(error, 'Не удалось удалить расход'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Финансы</h1>
          <p>Расходы на инфраструктуру, домены и сервисы</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() => setEditor({ mode: 'create' })}
        >
          <IconPlus /> Добавить расход
        </button>
      </div>

      <div className="grid-cards">
        <article className="card entity-card">
          <div className="top">
            <h3>Всего в vault</h3>
          </div>
          {loading ? (
            <div className="skeleton-line skeleton-title" style={{ width: '40%' }} />
          ) : (
            <>
              <div className="money">{total.toLocaleString('ru-RU')} ₽</div>
              <p>{items.length} записей</p>
            </>
          )}
        </article>
      </div>

      <div className="card table-card" style={{ marginTop: 16 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : items.length === 0 ? (
          <div className="empty-hint table-empty">Пока нет расходов — добавьте первый</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Статья</th>
                <th>Категория</th>
                <th>Проект</th>
                <th>Сумма</th>
                <th>Дата</th>
                <th className="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  data-entity-id={row.id}
                  className={highlightId === row.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{row.title}</strong>
                  </td>
                  <td>{row.category}</td>
                  <td>{row.project}</td>
                  <td>{row.amount.toLocaleString('ru-RU')} ₽</td>
                  <td>{row.date}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        title="Редактировать"
                        aria-label={`Редактировать ${row.title}`}
                        disabled={busy}
                        onClick={() => setEditor({ mode: 'edit', entry: row })}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="icon-action icon-action-danger"
                        type="button"
                        title="Удалить"
                        aria-label={`Удалить ${row.title}`}
                        disabled={busy}
                        onClick={() => setConfirmDelete(row)}
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

      <FinanceFormModal
        open={editor !== null}
        mode={editor?.mode ?? 'create'}
        initial={editor?.entry}
        busy={busy}
        onClose={() => setEditor(null)}
        onSubmit={saveExpense}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Удалить расход?"
        message={`Запись «${confirmDelete?.title ?? ''}» будет удалена из vault без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}
