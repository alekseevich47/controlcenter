import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import {
  ACTIVE_PROJECT_STATUSES,
  normalizeProjectStatus,
  type ProjectStatus,
} from '../vault/projectStatus'
import type { Client, Project } from '../vault/types'
import { CustomSelect } from './CustomSelect'
import { IconClose } from './Icons'

const MAX = {
  name: 120,
  stack: 200,
  client: 120,
  domain: 200,
  note: 2000,
} as const

export type ProjectFormValues = {
  name: string
  status: ProjectStatus
  stack: string
  client: string
  clientId: string | null
  domain: string
  note: string
}

interface ProjectFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Project | null
  clients: Client[]
  busy?: boolean
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => Promise<void> | void
}

function resolveClientId(p: Project | null | undefined, clients: Client[]): string | null {
  if (!p) return null
  if (p.clientId) return p.clientId
  const byName = clients.find((c) => c.name === p.client)
  return byName?.id ?? null
}

function fromProject(p?: Project | null, clients: Client[] = []): ProjectFormValues {
  const clientId = resolveClientId(p ?? null, clients)
  const clientName = clientId
    ? (clients.find((c) => c.id === clientId)?.name ?? p?.client ?? '')
    : (p?.client ?? '')
  return {
    name: p?.name ?? '',
    status: p ? normalizeProjectStatus(p.status) : 'Планирование',
    stack: p?.stack ?? '',
    client: clientName === '—' ? '' : clientName,
    clientId,
    domain: p?.domain ?? '',
    note: p?.note ?? '',
  }
}

function sanitize(values: ProjectFormValues, clients: Client[]): ProjectFormValues {
  const clientId = values.clientId?.trim() || null
  const fromList = clientId ? clients.find((c) => c.id === clientId) : undefined
  return {
    name: values.name.trim().slice(0, MAX.name),
    status: values.status === 'Удален' ? 'Планирование' : values.status,
    stack: values.stack.trim().slice(0, MAX.stack) || '—',
    client: fromList
      ? fromList.name.slice(0, MAX.client)
      : values.client.trim().slice(0, MAX.client) || '—',
    clientId: fromList ? fromList.id : null,
    domain: values.domain.trim().slice(0, MAX.domain) || '—',
    note: values.note.trim().slice(0, MAX.note),
  }
}

function ProjectFormBody({
  mode,
  initial,
  clients,
  busy,
  onClose,
  onSubmit,
}: Omit<ProjectFormModalProps, 'open'>) {
  const titleId = useId()
  const [values, setValues] = useState<ProjectFormValues>(() => fromProject(initial, clients))
  const [error, setError] = useState<string | null>(null)

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Без клиента' },
      ...[...clients]
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
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
    const next = sanitize(values, clients)
    if (!next.name) {
      setError('Укажите название проекта')
      return
    }
    setError(null)
    await onSubmit(next)
  }

  const statuses = ACTIVE_PROJECT_STATUSES

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-card card project-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-head">
          <h2 id={titleId}>{mode === 'create' ? 'Новый проект' : 'Редактировать проект'}</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="proj-name">Название</label>
            <input
              id="proj-name"
              autoFocus
              value={values.name}
              maxLength={MAX.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Например, Beauty+"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="proj-status">Статус</label>
            <CustomSelect
              id="proj-status"
              value={values.status === 'Удален' ? 'Планирование' : values.status}
              options={statuses.map((s) => ({ value: s, label: s }))}
              onChange={(status) =>
                setValues((v) => ({ ...v, status: status as ProjectStatus }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="proj-client">Клиент</label>
            <CustomSelect
              id="proj-client"
              value={values.clientId ?? ''}
              options={clientOptions}
              placeholder="Выбрать клиента…"
              emptyLabel="Нет клиентов в vault"
              onChange={(clientId) => {
                const c = clients.find((x) => x.id === clientId)
                setValues((v) => ({
                  ...v,
                  clientId: clientId || null,
                  client: c?.name ?? '',
                }))
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="proj-domain">Домен</label>
            <input
              id="proj-domain"
              value={values.domain}
              maxLength={MAX.domain}
              onChange={(e) => setValues((v) => ({ ...v, domain: e.target.value }))}
              placeholder="example.loomixx.ru"
            />
          </div>
          <div className="field">
            <label htmlFor="proj-stack">Стек</label>
            <input
              id="proj-stack"
              value={values.stack}
              maxLength={MAX.stack}
              onChange={(e) => setValues((v) => ({ ...v, stack: e.target.value }))}
              placeholder="React · Nest · Postgres"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="proj-note">Описание</label>
            <textarea
              id="proj-note"
              value={values.note}
              maxLength={MAX.note}
              onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
              placeholder="Краткий паспорт проекта"
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

export function ProjectFormModal({
  open,
  mode,
  initial,
  clients,
  busy,
  onClose,
  onSubmit,
}: ProjectFormModalProps) {
  if (!open) return null
  return (
    <ProjectFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      clients={clients}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
