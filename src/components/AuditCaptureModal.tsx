import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { COLLECTION_LABELS } from '../vault/audit'
import {
  cloneHistoryCapture,
  HISTORY_EVENT_META,
} from '../vault/historyPrefs'
import type {
  AuditableCollection,
  CrudCaptureFlags,
  HistoryCapturePrefs,
  HistoryEventFlag,
} from '../vault/types'
import { AUDITABLE_COLLECTIONS } from '../vault/types'
import { IconClose } from './Icons'

type Props = {
  open: boolean
  initial: HistoryCapturePrefs
  busy?: boolean
  onClose: () => void
  onSave: (capture: HistoryCapturePrefs) => void
}

const CRUD_COLS: { key: keyof CrudCaptureFlags; label: string }[] = [
  { key: 'create', label: 'Создание' },
  { key: 'update', label: 'Изменение' },
  { key: 'delete', label: 'Удаление' },
]

export function AuditCaptureModal({ open, initial, busy = false, onClose, onSave }: Props) {
  if (!open) return null
  return (
    <AuditCaptureBody
      key="audit-capture-open"
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

function AuditCaptureBody({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: HistoryCapturePrefs
  busy: boolean
  onClose: () => void
  onSave: (capture: HistoryCapturePrefs) => void
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState(() => cloneHistoryCapture(initial))

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const entityRows = useMemo(
    () =>
      AUDITABLE_COLLECTIONS.map((col) => ({
        col,
        label: COLLECTION_LABELS[col],
      })),
    [],
  )

  function setEntityFlag(col: AuditableCollection, key: keyof CrudCaptureFlags, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      entities: {
        ...prev.entities,
        [col]: { ...prev.entities[col], [key]: value },
      },
    }))
  }

  function setEventFlag(key: HistoryEventFlag, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      events: { ...prev.events, [key]: value },
    }))
  }

  function setAllEntities(value: boolean) {
    setDraft((prev) => {
      const entities = { ...prev.entities }
      for (const col of AUDITABLE_COLLECTIONS) {
        entities[col] = { create: value, update: value, delete: value }
      }
      return { ...prev, entities }
    })
  }

  function setAllEvents(value: boolean) {
    setDraft((prev) => {
      const events = { ...prev.events }
      for (const meta of HISTORY_EVENT_META) events[meta.key] = value
      return { ...prev, events }
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal-card card audit-capture-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId}>Фиксировать в истории</h2>
            <p className="audit-capture-lead">
              Включайте и отключайте аудит по разделам и системным событиям
            </p>
          </div>
          <button
            ref={closeRef}
            className="icon-btn modal-close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={busy}
          >
            <IconClose />
          </button>
        </div>

        <div className="audit-capture-toolbar">
          <span>Разделы vault</span>
          <div className="audit-capture-toolbar-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAllEntities(true)} disabled={busy}>
              Включить все
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAllEntities(false)} disabled={busy}>
              Выключить все
            </button>
          </div>
        </div>

        <div className="audit-capture-table-wrap">
          <table className="table audit-capture-table">
            <thead>
              <tr>
                <th scope="col">Раздел</th>
                {CRUD_COLS.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entityRows.map(({ col, label }) => (
                <tr key={col}>
                  <th scope="row">{label}</th>
                  {CRUD_COLS.map((c) => (
                    <td key={c.key}>
                      <label className="audit-check">
                        <input
                          type="checkbox"
                          checked={draft.entities[col][c.key]}
                          disabled={busy}
                          onChange={(e) => setEntityFlag(col, c.key, e.target.checked)}
                          aria-label={`${label}: ${c.label}`}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="audit-capture-toolbar" style={{ marginTop: 18 }}>
          <span>События приложения</span>
          <div className="audit-capture-toolbar-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAllEvents(true)} disabled={busy}>
              Включить все
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAllEvents(false)} disabled={busy}>
              Выключить все
            </button>
          </div>
        </div>

        <div className="audit-capture-table-wrap">
          <table className="table audit-capture-table audit-capture-events">
            <thead>
              <tr>
                <th scope="col">Событие</th>
                <th scope="col">Фиксировать</th>
              </tr>
            </thead>
            <tbody>
              {HISTORY_EVENT_META.map((meta) => (
                <tr key={meta.key}>
                  <th scope="row">
                    <div className="audit-event-label">
                      <strong>{meta.label}</strong>
                      <span>{meta.hint}</span>
                    </div>
                  </th>
                  <td>
                    <label className="audit-check">
                      <input
                        type="checkbox"
                        checked={draft.events[meta.key]}
                        disabled={busy}
                        onChange={(e) => setEventFlag(meta.key, e.target.checked)}
                        aria-label={meta.label}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => onSave(cloneHistoryCapture(draft))}
          >
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
