import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconRefresh } from '../components/Icons'
import { useToast } from '../components/ToastProvider'
import { UpdateOfferModal } from '../components/UpdateOfferModal'
import {
  CHANGELOG,
  formatChangelogDate,
  type ChangelogEntry,
} from '../updates/changelog'
import { useUpdates } from '../updates/UpdateProvider'
import { APP_BUILD, APP_CHANNEL, APP_VERSION } from '../version'
import { isTauri } from '../vault/runtime'

export function UpdatesPage() {
  const { notify } = useToast()
  const {
    available,
    checking,
    applying,
    lastCheckedAt,
    offerOpen,
    openOffer,
    closeOffer,
    checkNow,
    applyNow,
  } = useUpdates()
  const [selectedId, setSelectedId] = useState<string>(CHANGELOG[0]?.id ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const headingId = useId()
  const alive = useRef(true)
  const applyLock = useRef(false)
  const runtime = isTauri() ? 'Tauri (диск ПК)' : 'браузер (IndexedDB)'

  const selected = CHANGELOG.find((entry) => entry.id === selectedId) ?? CHANGELOG[0] ?? null
  const busy = checking || applying
  const label = applying
    ? 'Обновляем…'
    : checking
      ? 'Проверяем…'
      : available
        ? 'Обновить'
        : 'Проверить обновления'

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  function onSelect(entry: ChangelogEntry) {
    setSelectedId(entry.id)
  }

  async function runApply() {
    if (applyLock.current) return
    applyLock.current = true
    try {
      const result = await applyNow()
      if (!alive.current) return
      setConfirmOpen(false)
      const message = result.message.trim() || (result.ok ? 'LCC обновлён' : 'Не удалось обновить LCC')
      notify({ message, tone: result.ok ? 'success' : 'danger' })
    } finally {
      applyLock.current = false
    }
  }

  async function onCheckUpdates() {
    const result = await checkNow()
    if (!alive.current) return
    if (result.status === 'available') {
      openOffer()
      return
    }
    if (result.status === 'current') {
      notify({ message: `Установлена актуальная версия v${APP_VERSION}`, tone: 'info' })
      return
    }
    if (result.message && result.message !== 'Проверка прервана') {
      notify({ message: result.message, tone: 'danger' })
    }
  }

  function onPrimaryClick() {
    if (busy) return
    if (available) {
      setConfirmOpen(true)
      return
    }
    void onCheckUpdates()
  }

  const note = available
    ? `Доступна v${available.version}, сборка ${available.build}`
    : lastCheckedAt
      ? `Последняя проверка: ${formatCheckedAt(lastCheckedAt)}`
      : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1 id={headingId}>Обновление</h1>
          <p>Текущая сборка, журнал релизов и проверка обновлений</p>
        </div>
        <button
          className="btn btn-primary updates-check-btn"
          type="button"
          onClick={onPrimaryClick}
          disabled={busy}
          aria-busy={busy}
        >
          <IconRefresh width={16} height={16} className={busy ? 'spin' : undefined} />
          {label}
        </button>
      </div>

      <section className="card updates-current" aria-labelledby={headingId}>
        <div className="updates-current-mark" aria-hidden>
          <IconRefresh />
        </div>
        <div className="updates-current-grid">
          <div className="updates-stat">
            <span className="updates-stat-label">Версия</span>
            <strong className="updates-stat-value mono">v{APP_VERSION}</strong>
          </div>
          <div className="updates-stat">
            <span className="updates-stat-label">Сборка</span>
            <strong className="updates-stat-value mono">{APP_BUILD}</strong>
          </div>
          <div className="updates-stat">
            <span className="updates-stat-label">Канал</span>
            <strong className="updates-stat-value">
              <span className="badge badge-green">{APP_CHANNEL}</span>
            </strong>
          </div>
          <div className="updates-stat">
            <span className="updates-stat-label">Среда</span>
            <strong className="updates-stat-value">{runtime}</strong>
          </div>
        </div>
        {note ? (
          <p className="updates-current-note" aria-live="polite">
            {note}
          </p>
        ) : null}
      </section>

      <div className={`updates-layout${selected ? ' has-detail' : ''}`}>
        <div className="card updates-list-card">
          <div className="updates-list-head">
            <h2>История обновлений</h2>
            <span className="updates-list-count">{CHANGELOG.length}</span>
          </div>
          <ul className="updates-list" role="listbox" aria-label="История обновлений">
            {CHANGELOG.map((entry, index) => {
              const active = entry.id === selected?.id
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`updates-row${active ? ' active' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
                    onClick={() => onSelect(entry)}
                  >
                    <div className="updates-row-top">
                      {entry.version ? (
                        <span className="badge badge-blue">v{entry.version}</span>
                      ) : (
                        <span className="badge badge-amber">dev</span>
                      )}
                      <time className="updates-when" dateTime={entry.date}>
                        {formatChangelogDate(entry.date)}
                      </time>
                    </div>
                    <strong className="updates-title">{entry.title}</strong>
                    <span className="updates-preview">{entry.highlights[0] ?? 'Без описания'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {selected ? (
          <article className="card updates-detail" aria-live="polite">
            <div className="updates-detail-head">
              <div>
                {selected.version ? (
                  <span className="badge badge-blue">v{selected.version}</span>
                ) : (
                  <span className="badge badge-amber">dev</span>
                )}
                <h2>{selected.title}</h2>
                <time dateTime={selected.date}>{formatChangelogDate(selected.date)}</time>
              </div>
            </div>
            <ul className="updates-highlights">
              {selected.highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ) : null}
      </div>

      <UpdateOfferModal
        open={offerOpen}
        update={available}
        applying={applying}
        onClose={closeOffer}
        onApply={() => void runApply()}
      />

      {available ? (
        <ConfirmDialog
          open={confirmOpen}
          title={`Обновить LCC до v${available.version}?`}
          message={`${available.title ? `«${available.title}». ` : ''}Подтянутся файлы из origin/main, только fast-forward. Локальные правки не стираются.`}
          confirmLabel="Обновить"
          cancelLabel="Отмена"
          busy={applying}
          onConfirm={() => void runApply()}
          onCancel={() => {
            if (!applying) setConfirmOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function formatCheckedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
