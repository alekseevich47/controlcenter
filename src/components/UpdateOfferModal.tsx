import { useEffect, useId, useRef } from 'react'
import type { PendingUpdate } from '../updates/pending'
import { IconClose } from './Icons'

type UpdateOfferModalProps = {
  open: boolean
  update: PendingUpdate | null
  applying: boolean
  onClose: () => void
  onApply: () => void
}

/** Предложение новой версии. Закрытие — «Позже»: pending остаётся, установка не стартует. */
export function UpdateOfferModal({ open, update, applying, onClose, onApply }: UpdateOfferModalProps) {
  const titleId = useId()
  const laterRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    laterRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !update) return null

  const highlights = (update.highlights ?? []).filter(
    (line): line is string => typeof line === 'string' && line.trim().length > 0,
  )

  return (
    <div
      className="modal-backdrop update-offer-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="modal-card card update-offer-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>Появилась новая версия</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="update-offer-meta">
          <div className="update-offer-line">
            <span>Версия</span>
            <strong className="update-offer-value">v{update.version}</strong>
          </div>
          <div className="update-offer-line">
            <span>Сборка</span>
            <strong className="update-offer-value">{update.build}</strong>
          </div>
          {update.title ? (
            <div className="update-offer-line">
              <span>Релиз</span>
              <strong className="update-offer-title">{update.title}</strong>
            </div>
          ) : null}
        </div>

        {highlights.length > 0 ? (
          <>
            <p className="update-offer-label">Что нового</p>
            <ul className="updates-highlights">
              {highlights.map((line, index) => (
                <li key={`${index}:${line}`}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="modal-actions">
          <button ref={laterRef} className="btn btn-ghost" type="button" onClick={onClose}>
            Позже
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={applying}
            onClick={() => {
              if (applying) return
              onClose()
              onApply()
            }}
          >
            {applying ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
      </div>
    </div>
  )
}
