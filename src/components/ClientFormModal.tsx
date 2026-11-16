import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { CLIENT_FIELD_MAX, normalizeClient } from '../vault/clientContacts'
import type { Client, Project } from '../vault/types'
import { CustomSelect } from './CustomSelect'
import { IconClose } from './Icons'

const MAX = CLIENT_FIELD_MAX

export type ClientFormValues = {
  name: string
  note: string
  projectIds: string[]
}

interface ClientFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Client | null
  projects: Project[]
  busy?: boolean
  onClose: () => void
  onSubmit: (values: ClientFormValues) => Promise<void> | void
}

function fromClient(c?: Client | null, projects: Project[] = []): ClientFormValues {
  if (!c) return { name: '', note: '', projectIds: [] }
  const n = normalizeClient(c)
  let projectIds = n.projectIds ?? []
  if (projectIds.length === 0) {
    // legacy: проекты с clientId / совпадением имени
    projectIds = projects
      .filter((p) => p.clientId === n.id || (!p.clientId && p.client === n.name))
      .map((p) => p.id)
  }
  return {
    name: n.name,
    note: n.note,
    projectIds,
  }
}

function sanitize(values: ClientFormValues): ClientFormValues {
  return {
    name: values.name.trim().slice(0, MAX.name),
    note: values.note.trim().slice(0, MAX.note),
    projectIds: values.projectIds
      .map((id) => id.trim())
      .filter((id) => id && !/[/\\]/.test(id))
      .slice(0, MAX.projectIds),
  }
}

function ClientFormBody({
  mode,
  initial,
  projects,
  busy,
  onClose,
  onSubmit,
}: Omit<ClientFormModalProps, 'open'>) {
  const titleId = useId()
  const [values, setValues] = useState<ClientFormValues>(() => fromClient(initial, projects))
  const [error, setError] = useState<string | null>(null)

  const projectOptions = useMemo(
    () =>
      [...projects]
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next = sanitize(values)
    if (!next.name) {
      setError('Укажите ФИО клиента')
      return
    }
    setError(null)
    await onSubmit(next)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-card card client-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-head">
          <h2 id={titleId}>{mode === 'create' ? 'Новый клиент' : 'Редактировать клиента'}</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="client-name">ФИО</label>
            <input
              id="client-name"
              autoFocus
              value={values.name}
              maxLength={MAX.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Например, Миленьких"
              required
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="client-projects">Проекты</label>
            <CustomSelect
              id="client-projects"
              multiple
              value={values.projectIds}
              options={projectOptions}
              placeholder="Привязать проекты…"
              emptyLabel="Нет проектов в vault"
              onChange={(projectIds) => setValues((v) => ({ ...v, projectIds }))}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="client-note">Заметка</label>
            <textarea
              id="client-note"
              value={values.note}
              maxLength={MAX.note}
              onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
              placeholder="Кратко о клиенте"
            />
          </div>
        </div>

        {error && <div className="unlock-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : mode === 'create' ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ClientFormModal({
  open,
  mode,
  initial,
  projects,
  busy,
  onClose,
  onSubmit,
}: ClientFormModalProps) {
  if (!open) return null
  return (
    <ClientFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      projects={projects}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
