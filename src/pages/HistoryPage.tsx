import { useEffect, useMemo, useState } from 'react'
import { IconClose } from '../components/Icons'
import { TableSkeleton } from '../components/Skeleton'
import { useAppSearch } from '../hooks/useAppSearch'

import {
  ACTION_LABELS,
  COLLECTION_LABELS,
  buildDiff,
  eventMatchesQuery,
  formatAuditWhen,
  formatDiffValue,
  normalizeAction,
  type DiffRow,
} from '../vault/audit'
import type { Collection, VaultEvent } from '../vault/types'
import { useCollection } from '../vault/useCollection'

export function HistoryPage() {
  const { items, loading } = useCollection('events')
  const { query } = useAppSearch()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const filtered = items.filter((e) => eventMatchesQuery(e, query))
    return filtered.sort((a, b) => {
      const ta = a.createdAt || a.updatedAt || ''
      const tb = b.createdAt || b.updatedAt || ''
      return tb.localeCompare(ta)
    })
  }, [items, query])

  useEffect(() => {
    if (selectedId && !sorted.some((e) => e.id === selectedId)) {
      setSelectedId(null)
    }
  }, [sorted, selectedId])

  const selected = useMemo(
    () => sorted.find((e) => e.id === selectedId) ?? null,
    [sorted, selectedId],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>История</h1>
          <p>Все изменения vault: кто, когда и что менял. Поиск в истории — в верхней строке</p>
        </div>
      </div>

      <div className={`history-layout${selected ? ' has-detail' : ''}`}>
        <div className="card history-list-card">
          {loading ? (
            <TableSkeleton cols={4} />
          ) : sorted.length === 0 ? (
            <div className="empty-hint table-empty">
              {query.trim()
                ? 'Ничего не найдено по запросу из верхней строки поиска'
                : 'Пока нет записей истории'}
            </div>
          ) : (
            <ul className="history-list" role="listbox" aria-label="Журнал изменений">
              {sorted.map((event) => {
                const active = event.id === selectedId
                const action = normalizeAction(event.action)
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`history-row${active ? ' active' : ''}`}
                      onClick={() => setSelectedId(event.id)}
                    >
                      <div className="history-row-top">
                        <span className={`badge history-action badge-${actionTone(action)}`}>
                          {ACTION_LABELS[action]}
                        </span>
                        <time className="history-when" dateTime={event.createdAt}>
                          {event.createdAt ? formatAuditWhen(event.createdAt) : event.when}
                        </time>
                      </div>
                      <strong className="history-title">{event.title}</strong>
                      <div className="history-meta">
                        <span>{event.actor?.trim() || 'Неизвестно'}</span>
                        {event.actorRole ? <span className="history-dot">·</span> : null}
                        {event.actorRole ? <span>{roleLabel(event.actorRole)}</span> : null}
                        {event.collection ? (
                          <>
                            <span className="history-dot">·</span>
                            <span>
                              {COLLECTION_LABELS[event.collection as Collection] ??
                                event.collection}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {selected && (
          <HistoryDetail event={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </>
  )
}

function HistoryDetail({
  event,
  onClose,
}: {
  event: VaultEvent
  onClose: () => void
}) {
  const action = normalizeAction(event.action)
  const [showUnchanged, setShowUnchanged] = useState(false)

  const diffs = useMemo(() => {
    const rows = buildDiff(event.before ?? null, event.after ?? null)
    return showUnchanged ? rows : rows.filter((r) => r.kind !== 'same')
  }, [event.before, event.after, showUnchanged])

  const hasSnapshots = event.before != null || event.after != null

  return (
    <aside className="card history-detail" aria-label="Детали изменения">
      <div className="history-detail-head">
        <div>
          <span className={`badge history-action badge-${actionTone(action)}`}>
            {ACTION_LABELS[action]}
          </span>
          <h2>{event.entityLabel || event.title}</h2>
        </div>
        <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
          <IconClose />
        </button>
      </div>

      <dl className="history-kv">
        <div>
          <dt>Когда</dt>
          <dd>{event.createdAt ? formatAuditWhen(event.createdAt) : event.when}</dd>
        </div>
        <div>
          <dt>Кто</dt>
          <dd>
            {event.actor?.trim() || 'Неизвестно'}
            {event.actorRole ? ` · ${roleLabel(event.actorRole)}` : ''}
          </dd>
        </div>
        <div>
          <dt>Что</dt>
          <dd>{event.title}</dd>
        </div>
        {event.collection && (
          <div>
            <dt>Раздел</dt>
            <dd>
              {COLLECTION_LABELS[event.collection as Collection] ?? event.collection}
              {event.entityId ? (
                <>
                  {' '}
                  <span className="mono">{event.entityId}</span>
                </>
              ) : null}
            </dd>
          </div>
        )}
      </dl>

      {hasSnapshots ? (
        <>
          <div className="history-diff-toolbar">
            <h3>Diff</h3>
            <label className="history-toggle">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              Показать без изменений
            </label>
          </div>
          {diffs.length === 0 ? (
            <div className="empty-hint table-empty">Нет отличимых отличий полей</div>
          ) : (
            <div className="history-diff">
              {diffs.map((row) => (
                <DiffBlock key={row.key} row={row} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="empty-hint table-empty">
          Для этой записи нет снимков before/after (заметка без diff)
        </div>
      )}
    </aside>
  )
}

function DiffBlock({ row }: { row: DiffRow }) {
  return (
    <div className={`diff-row diff-${row.kind}`}>
      <div className="diff-key">
        <span className={`diff-kind-pill diff-kind-${row.kind}`}>{diffKindLabel(row.kind)}</span>
        <code>{row.key}</code>
      </div>
      <div className="diff-cols">
        <div className="diff-cell before">
          <small>Было</small>
          <pre>{formatDiffValue(row.kind === 'added' ? undefined : row.before)}</pre>
        </div>
        <div className="diff-cell after">
          <small>Стало</small>
          <pre>{formatDiffValue(row.kind === 'removed' ? undefined : row.after)}</pre>
        </div>
      </div>
    </div>
  )
}

function actionTone(action: ReturnType<typeof normalizeAction>): string {
  if (action === 'create') return 'green'
  if (action === 'delete') return 'red'
  if (action === 'update') return 'blue'
  return 'amber'
}

function diffKindLabel(kind: DiffRow['kind']): string {
  if (kind === 'added') return '+'
  if (kind === 'removed') return '−'
  if (kind === 'changed') return '~'
  return '='
}

function roleLabel(role: string): string {
  if (role === 'owner') return 'владелец'
  if (role === 'partner') return 'напарник'
  return role
}
