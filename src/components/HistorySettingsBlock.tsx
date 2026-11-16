import { useMemo, useState } from 'react'
import {
  cloneHistoryCapture,
  presetToFilter,
  purgePresetLabel,
  type HistoryPurgePreset,
} from '../vault/historyPrefs'
import type { HistoryCapturePrefs } from '../vault/types'
import { useVault } from '../vault/VaultContext'
import { AuditCaptureModal } from './AuditCaptureModal'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './ToastProvider'

const PRESETS: { id: HistoryPurgePreset; label: string }[] = [
  { id: 'hour', label: 'За последний час' },
  { id: 'day', label: 'За последний день' },
  { id: 'week', label: 'За 7 дней' },
  { id: 'all', label: 'Всю историю' },
  { id: 'custom', label: 'Период…' },
]

export function HistorySettingsBlock() {
  const { prefs, savePrefs, purgeHistory } = useVault()
  const { notify } = useToast()

  const [preset, setPreset] = useState<HistoryPurgePreset>('day')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureBusy, setCaptureBusy] = useState(false)

  const capture = useMemo(
    () => cloneHistoryCapture(prefs.history.capture),
    [prefs.history],
  )

  function requestPurge() {
    const filter = presetToFilter(preset, customFrom, customTo)
    if ('error' in filter) {
      notify({ message: filter.error, tone: 'danger' })
      return
    }
    setConfirmOpen(true)
  }

  async function runPurge() {
    const filter = presetToFilter(preset, customFrom, customTo)
    if ('error' in filter) {
      notify({ message: filter.error, tone: 'danger' })
      setConfirmOpen(false)
      return
    }
    setPurgeBusy(true)
    try {
      const n = await purgeHistory(filter)
      notify({
        message:
          n === 0
            ? 'Нет записей за выбранный период'
            : `Удалено записей истории: ${n}`,
        tone: n === 0 ? 'info' : 'success',
      })
      setConfirmOpen(false)
    } catch (e) {
      notify({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
    } finally {
      setPurgeBusy(false)
    }
  }

  async function onSaveCapture(next: HistoryCapturePrefs) {
    setCaptureBusy(true)
    try {
      await savePrefs({
        history: {
          ...prefs.history,
          capture: next,
        },
      })
      notify({ message: 'Правила фиксации сохранены', tone: 'success' })
      setCaptureOpen(false)
    } catch (e) {
      notify({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
    } finally {
      setCaptureBusy(false)
    }
  }

  const confirmMessage =
    preset === 'all'
      ? 'Будут безвозвратно удалены все записи журнала истории. Продолжить?'
      : `Будут безвозвратно удалены записи истории ${purgePresetLabel(preset)}. Продолжить?`

  return (
    <>
      <section className="card settings-block">
        <h3>История</h3>
        <p>Очистка журнала изменений и выбор того, что фиксировать в audit log</p>

        <div className="history-settings-section">
          <strong className="history-settings-label">Удаление истории</strong>
          <div className="history-purge-presets" role="group" aria-label="Период удаления">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip-btn${preset === p.id ? ' active' : ''}`}
                aria-pressed={preset === p.id}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' ? (
            <div className="form-grid history-purge-range">
              <div className="field">
                <label htmlFor="history-from">С</label>
                <input
                  id="history-from"
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="history-to">По</label>
                <input
                  id="history-to"
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="history-settings-actions">
            <button className="btn btn-danger" type="button" onClick={requestPurge}>
              Удалить историю
            </button>
          </div>
        </div>

        <div className="toggle-row history-capture-row">
          <div>
            <strong>Фиксировать в истории</strong>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              Таблица: создание / изменение / удаление по разделам и системные события
            </div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setCaptureOpen(true)}>
            Настроить
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Удалить историю?"
        message={confirmMessage}
        confirmLabel="Удалить"
        danger
        busy={purgeBusy}
        onCancel={() => !purgeBusy && setConfirmOpen(false)}
        onConfirm={() => void runPurge()}
      />

      <AuditCaptureModal
        open={captureOpen}
        initial={capture}
        busy={captureBusy}
        onClose={() => !captureBusy && setCaptureOpen(false)}
        onSave={(next) => void onSaveCapture(next)}
      />
    </>
  )
}
