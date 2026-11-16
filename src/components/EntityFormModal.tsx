import { useEffect, useId, type FormEvent, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface EntityFormModalProps {
  open: boolean
  title: string
  busy?: boolean
  error?: string | null
  submitLabel: string
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  children: ReactNode
}

/** Общая оболочка модалки создания/редактирования. Escape и клик по фону закрывают. */
export function EntityFormModal({
  open,
  title,
  busy = false,
  error,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: EntityFormModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-card card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="form-grid">{children}</div>
        {error ? <div className="unlock-error">{error}</div> : null}
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
