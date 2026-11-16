import { useId, useState, type FormEvent } from 'react'
import type { FinanceEntry } from '../vault/types'
import { EntityFormModal } from './EntityFormModal'
import { ProjectPicker } from './ProjectPicker'

const MAX = {
  title: 160,
  category: 80,
  date: 32,
} as const

export type FinanceFormValues = {
  title: string
  category: string
  amount: string
  date: string
  projectId: string
}

interface FinanceFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: FinanceEntry | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: FinanceFormValues) => Promise<void> | void
}

function draftFrom(entry?: FinanceEntry | null): FinanceFormValues {
  return {
    title: entry?.title ?? '',
    category: entry?.category ?? '',
    amount: entry ? String(entry.amount) : '',
    date: entry?.date ?? '',
    projectId: entry?.projectId ?? '',
  }
}

/** Пустая строка и нечисло (включая 0x/1e) не проходят. Запятая допустима как разделитель. */
function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000) return null
  return amount
}

function FinanceFormBody({
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: Omit<FinanceFormModalProps, 'open'>) {
  const titleId = useId()
  const categoryId = useId()
  const amountId = useId()
  const dateId = useId()
  const projectId = useId()
  const [values, setValues] = useState<FinanceFormValues>(() => draftFrom(initial))
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<FinanceFormValues>) {
    setError(null)
    setValues((current) => ({ ...current, ...patch }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const title = values.title.trim()
    const amount = parseAmount(values.amount)
    if (!title) {
      setError('Укажите название')
      return
    }
    if (amount === null) {
      setError('Сумма должна быть числом')
      return
    }
    setError(null)
    await onSubmit({
      title: title.slice(0, MAX.title),
      category: values.category.trim().slice(0, MAX.category),
      amount: String(amount),
      date: values.date.trim().slice(0, MAX.date),
      projectId: values.projectId,
    })
  }

  return (
    <EntityFormModal
      open
      title={mode === 'create' ? 'Добавить расход' : 'Редактировать расход'}
      busy={busy}
      error={error}
      submitLabel={mode === 'create' ? 'Добавить' : 'Сохранить'}
      onClose={onClose}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={titleId}>Название</label>
        <input
          id={titleId}
          autoFocus
          value={values.title}
          maxLength={MAX.title}
          placeholder="VPS Timeweb"
          onChange={(event) => update({ title: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={categoryId}>Категория</label>
        <input
          id={categoryId}
          value={values.category}
          maxLength={MAX.category}
          placeholder="Серверы"
          onChange={(event) => update({ category: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={amountId}>Сумма</label>
        <input
          id={amountId}
          type="number"
          step="0.01"
          inputMode="decimal"
          value={values.amount}
          placeholder="0.00"
          onChange={(event) => update({ amount: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={dateId}>Дата</label>
        <input
          id={dateId}
          type="text"
          value={values.date}
          maxLength={MAX.date}
          placeholder="01.11 или 2026-11-01"
          onChange={(event) => update({ date: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={projectId}>Проект</label>
        <ProjectPicker
          id={projectId}
          value={values.projectId}
          onChange={(next) => update({ projectId: next })}
        />
      </div>
    </EntityFormModal>
  )
}

export function FinanceFormModal({
  open,
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: FinanceFormModalProps) {
  if (!open) return null
  return (
    <FinanceFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
