import { useEffect, useId, useRef } from 'react'
import type { Server } from '../../vault/types'
import { IconClose } from '../Icons'

interface AttachServersModalProps {
  open: boolean
  servers: Server[]
  busyId: string | null
  onClose: () => void
  onAttach: (server: Server) => void
}

export function AttachServersModal({
  open,
  servers,
  busyId,
  onClose,
  onAttach,
}: AttachServersModalProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card card servers-attach-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>Прикрепить сервер</h2>
          <button
            ref={closeRef}
            className="icon-btn modal-close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <p className="servers-note">
          Добавится привязка к этому проекту. Остальные проекты сервера не изменятся.
        </p>
        {servers.length === 0 ? (
          <div className="empty-hint">Нет серверов без этого проекта.</div>
        ) : (
          <div className="servers-attach-list">
            {servers.map((server) => {
              const busy = busyId === server.id
              return (
                <div key={server.id} className="servers-attach-row">
                  <div>
                    <strong>{server.name}</strong>
                    <small>{server.host}</small>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={Boolean(busyId)}
                    onClick={() => onAttach(server)}
                  >
                    {busy ? 'Прикрепляем…' : 'Прикрепить'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
