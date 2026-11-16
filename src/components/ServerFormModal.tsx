import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  SERVER_STATUSES,
  normalizeServerStatus,
  type ServerStatus,
} from '../vault/serverStatus'
import type { Server } from '../vault/types'
import { CustomSelect } from './CustomSelect'
import { IconClose } from './Icons'

const MAX = {
  name: 120,
  host: 200,
  specs: 200,
  role: 200,
} as const

export type ServerFormValues = {
  name: string
  host: string
  specs: string
  role: string
  status: ServerStatus
}

interface ServerFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Server | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: ServerFormValues) => Promise<void> | void
}

function fromServer(s?: Server | null): ServerFormValues {
  return {
    name: s?.name ?? '',
    host: s?.host ?? '',
    specs: s?.specs ?? '',
    role: s?.role ?? '',
    status: s ? normalizeServerStatus(s.status) : 'Online',
  }
}

function sanitize(values: ServerFormValues): ServerFormValues {
  return {
    name: values.name.trim().slice(0, MAX.name),
    host: values.host.trim().slice(0, MAX.host) || '—',
    specs: values.specs.trim().slice(0, MAX.specs) || '—',
    role: values.role.trim().slice(0, MAX.role) || '—',
    status: normalizeServerStatus(values.status),
  }
}

function ServerFormBody({
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: Omit<ServerFormModalProps, 'open'>) {
  const titleId = useId()
  const [values, setValues] = useState<ServerFormValues>(() => fromServer(initial))
  const [error, setError] = useState<string | null>(null)

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
      setError('Укажите название сервера')
      return
    }
    setError(null)
    await onSubmit(next)
  }

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
          <h2 id={titleId}>{mode === 'create' ? 'Добавить сервер' : 'Редактировать сервер'}</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="srv-name">Название</label>
            <input
              id="srv-name"
              autoFocus
              value={values.name}
              maxLength={MAX.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Prod Server"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="srv-host">Хост</label>
            <input
              id="srv-host"
              value={values.host}
              maxLength={MAX.host}
              onChange={(e) => setValues((v) => ({ ...v, host: e.target.value }))}
              placeholder="VPS · Timeweb"
            />
          </div>
          <div className="field">
            <label htmlFor="srv-status">Статус</label>
            <CustomSelect
              id="srv-status"
              value={values.status}
              options={SERVER_STATUSES.map((s) => ({ value: s, label: s }))}
              onChange={(status) =>
                setValues((v) => ({ ...v, status: status as ServerStatus }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="srv-specs">Ресурсы</label>
            <input
              id="srv-specs"
              value={values.specs}
              maxLength={MAX.specs}
              onChange={(e) => setValues((v) => ({ ...v, specs: e.target.value }))}
              placeholder="2 vCPU · 4 GB · 40 GB SSD"
            />
          </div>
          <div className="field">
            <label htmlFor="srv-role">Роль</label>
            <input
              id="srv-role"
              value={values.role}
              maxLength={MAX.role}
              onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
              placeholder="prod / staging / backup"
            />
          </div>
        </div>

        {error && <div className="unlock-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : mode === 'create' ? 'Добавить' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ServerFormModal({ open, mode, initial, busy, onClose, onSubmit }: ServerFormModalProps) {
  if (!open) return null
  return (
    <ServerFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
