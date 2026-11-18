import { useEffect, useId, useState, type FormEvent } from 'react'
import { CustomSelect } from './CustomSelect'
import { IconClose } from './Icons'
import { ProjectPicker } from './ProjectPicker'
import { SERVER_LIMITS, SERVER_ROLES, clip } from './servers/serverUi'

export type ServerFormValues = {
  name: string
  host: string
  specs: string
  role: string
  description: string
  projectId: string
}

interface ServerFormModalProps {
  open: boolean
  busy?: boolean
  /** Вкладка проекта: пикер скрыт, сервер сразу получит эту привязку. */
  lockedProject?: { id: string; name: string } | null
  onClose: () => void
  onSubmit: (values: ServerFormValues) => Promise<void> | void
}

const EMPTY: ServerFormValues = {
  name: '',
  host: '',
  specs: '',
  role: '',
  description: '',
  projectId: '',
}

function sanitize(values: ServerFormValues): ServerFormValues {
  return {
    name: clip(values.name, SERVER_LIMITS.name),
    host: clip(values.host, SERVER_LIMITS.host),
    specs: clip(values.specs, SERVER_LIMITS.specs),
    role: clip(values.role, SERVER_LIMITS.role),
    description: clip(values.description, SERVER_LIMITS.description),
    projectId: values.projectId.trim(),
  }
}

function ServerFormBody({
  busy,
  lockedProject,
  onClose,
  onSubmit,
}: Omit<ServerFormModalProps, 'open'>) {
  const titleId = useId()
  const [values, setValues] = useState<ServerFormValues>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
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
        className="modal-card card servers-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="modal-head">
          <h2 id={titleId}>Добавить сервер</h2>
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
              maxLength={SERVER_LIMITS.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              placeholder="Prod Server"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="srv-host">Хост</label>
            <input
              id="srv-host"
              value={values.host}
              maxLength={SERVER_LIMITS.host}
              onChange={(event) => setValues((current) => ({ ...current, host: event.target.value }))}
              placeholder="VPS · Timeweb"
            />
          </div>
          <div className="field">
            <label htmlFor="srv-specs">Ресурсы</label>
            <input
              id="srv-specs"
              value={values.specs}
              maxLength={SERVER_LIMITS.specs}
              onChange={(event) => setValues((current) => ({ ...current, specs: event.target.value }))}
              placeholder="2 vCPU · 4 GB · 40 GB SSD"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="srv-role">Роль</label>
            <CustomSelect
              id="srv-role"
              value={values.role}
              allowCustom
              placeholder="Роль"
              options={SERVER_ROLES.map((role) => ({ value: role, label: role }))}
              onChange={(role) => setValues((current) => ({ ...current, role }))}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="srv-desc">Описание</label>
            <textarea
              id="srv-desc"
              value={values.description}
              maxLength={SERVER_LIMITS.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="Для чего этот хост"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            {lockedProject ? (
              <p className="form-hint">Будет прикреплён к проекту «{lockedProject.name}».</p>
            ) : (
              <>
                <label htmlFor="srv-project">Проект</label>
                <ProjectPicker
                  id="srv-project"
                  value={values.projectId}
                  embedded={false}
                  onChange={(projectId) => setValues((current) => ({ ...current, projectId }))}
                />
              </>
            )}
          </div>
        </div>

        {error ? <div className="unlock-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Добавить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ServerFormModal({ open, busy, lockedProject, onClose, onSubmit }: ServerFormModalProps) {
  if (!open) return null
  return (
    <ServerFormBody
      key={lockedProject?.id ?? 'new'}
      busy={busy}
      lockedProject={lockedProject}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
