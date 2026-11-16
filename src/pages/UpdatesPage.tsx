import { useEffect, useId, useRef, useState } from 'react'
import { IconRefresh } from '../components/Icons'
import { useToast } from '../components/ToastProvider'
import {
  CHANGELOG,
  formatChangelogDate,
  type ChangelogEntry,
} from '../updates/changelog'
import { APP_BUILD, APP_CHANNEL, APP_VERSION } from '../version'
import { isTauri } from '../vault/runtime'

const CHECK_MS = 1400

type CheckPhase = 'idle' | 'checking' | 'done'

export function UpdatesPage() {
  const { notify } = useToast()
  const [selectedId, setSelectedId] = useState<string>(CHANGELOG[0]?.id ?? '')
  const [phase, setPhase] = useState<CheckPhase>('idle')
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const headingId = useId()
  const runtime = isTauri() ? 'Tauri (диск ПК)' : 'браузер (IndexedDB)'

  const selected =
    CHANGELOG.find((e) => e.id === selectedId) ?? CHANGELOG[0] ?? null

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  function onSelect(entry: ChangelogEntry) {
    setSelectedId(entry.id)
  }

  async function onCheckUpdates() {
    if (phase === 'checking') return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('checking')

    try {
      await delay(CHECK_MS, ac.signal)
      if (ac.signal.aborted) return
      const when = new Date().toISOString()
      setLastCheckedAt(when)
      setPhase('done')
      notify({
        message: 'Облачный канал обновлений ещё не подключён — вы на актуальной локальной сборке',
        tone: 'info',
      })
    } catch {
      if (!ac.signal.aborted) setPhase('idle')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 id={headingId}>Обновление</h1>
          <p>Текущая сборка, журнал релизов и проверка облачных апдейтов</p>
        </div>
        <button
          className="btn btn-primary updates-check-btn"
          type="button"
          onClick={() => void onCheckUpdates()}
          disabled={phase === 'checking'}
          aria-busy={phase === 'checking'}
        >
          <IconRefresh className={phase === 'checking' ? 'spin' : undefined} />
          {phase === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
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
        <p className="updates-current-note">
          {lastCheckedAt
            ? `Последняя проверка: ${formatCheckedAt(lastCheckedAt)}. Канал поставки появится вместе с cloud sync.`
            : 'Проверка обновлений — заглушка: облачного backend пока нет. История ниже ведётся вручную в репозитории.'}
        </p>
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
                    <span className="updates-preview">
                      {entry.highlights[0] ?? 'Без описания'}
                    </span>
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
    </>
  )
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = window.setTimeout(() => resolve(), ms)
    const onAbort = () => {
      window.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
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
