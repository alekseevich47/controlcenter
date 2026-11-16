import { useMemo, useState } from 'react'
import {
  ACTION_LABELS,
  COLLECTION_LABELS,
  buildDiff,
  formatAuditWhen,
  formatDiffValue,
  normalizeAction,
  type DiffRow,
} from '../vault/audit'
import type { Collection, Project, VaultEvent } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { IconClose } from './Icons'
import { TableSkeleton } from './Skeleton'

/** События, относящиеся к проекту и его сущностям. */
export function useProjectEvents(project: Project) {
  const { items: events, loading: eventsLoading } = useCollection('events')
  const { items: servers, loading: sLoading } = useCollection('servers')
  const { items: domains, loading: dLoading } = useCollection('domains')
  const { items: docs, loading: docLoading } = useCollection('docs')
  const { items: campaigns, loading: cLoading } = useCollection('campaigns')
  const { items: finance, loading: fLoading } = useCollection('finance')
  const { items: secrets, loading: secLoading } = useCollection('secrets')

  const loading =
    eventsLoading || sLoading || dLoading || docLoading || cLoading || fLoading || secLoading

  const relatedIds = useMemo(() => {
    const ids = new Set<string>([project.id])
    const take = (list: { id: string; projectId?: string; project?: string }[]) => {
      for (const row of list) {
        if (row.projectId === project.id) ids.add(row.id)
        else if (row.project === project.name || row.project === project.id) ids.add(row.id)
      }
    }
    take(servers)
    take(domains)
    take(docs)
    take(campaigns)
    take(finance)
    take(secrets)
    return ids
  }, [project.id, project.name, servers, domains, docs, campaigns, finance, secrets])

  const items = useMemo(() => {
    const scoped = events.filter((e) => {
      if (e.entityId && relatedIds.has(e.entityId)) return true
      if (e.collection === 'projects' && e.entityId === project.id) return true
      if (e.entityLabel && e.entityLabel === project.name) return true
      return false
    })
    return scoped.sort((a, b) => {
      const ta = a.createdAt || a.updatedAt || ''
      const tb = b.createdAt || b.updatedAt || ''
      return tb.localeCompare(ta)
    })
  }, [events, relatedIds, project.id, project.name])

  return { items, loading }
}

export function ProjectEventsPreview({
  project,
  limit = 8,
}: {
  project: Project
  limit?: number
}) {
  const { items, loading } = useProjectEvents(project)
  const preview = items.slice(0, limit)

  return (
    <section className="project-events-block" aria-label="События проекта">
      <div className="page-head page-head-compact">
        <div>
          <h2 className="panel-title">События</h2>
          <p className="muted-line">Последние действия с проектом и связанными объектами</p>
        </div>
      </div>
      <div className="card project-events-card">
        {loading ? (
          <TableSkeleton cols={3} rows={4} />
        ) : preview.length === 0 ? (
          <div className="empty-hint table-empty">Пока нет событий по этому проекту</div>
        ) : (
          <ul className="project-event-list">
            {preview.map((event) => (
              <ProjectEventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export function ProjectHistoryPanel({ project }: { project: Project }) {
  const { items, loading } = useProjectEvents(project)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => items.find((e) => e.id === selectedId) ?? null,
    [items, selectedId],
  )

  return (
    <div className={`history-layout${selected ? ' has-detail' : ''}`}>
      <div className="card history-list-card">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : items.length === 0 ? (
          <div className="empty-hint table-empty">История обновлений проекта пока пуста</div>
        ) : (
          <ul className="history-list" role="listbox" aria-label="История обновлений проекта">
            {items.map((event) => {
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
                      {event.collection ? (
                        <>
                          <span className="history-dot">·</span>
                          <span>
                            {COLLECTION_LABELS[event.collection as Collection] ?? event.collection}
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
        <ProjectHistoryDetail event={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function ProjectEventRow({ event }: { event: VaultEvent }) {
  const action = normalizeAction(event.action)
  return (
    <li className="project-event-row">
      <span className={`badge history-action badge-${actionTone(action)}`}>
        {ACTION_LABELS[action]}
      </span>
      <div className="project-event-body">
        <strong>{event.title}</strong>
        <span className="project-event-meta">
          {event.createdAt ? formatAuditWhen(event.createdAt) : event.when}
          {event.actor ? ` · ${event.actor}` : ''}
          {event.collection
            ? ` · ${COLLECTION_LABELS[event.collection as Collection] ?? event.collection}`
            : ''}
        </span>
      </div>
    </li>
  )
}

function ProjectHistoryDetail({
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
          <dd>{event.actor?.trim() || 'Неизвестно'}</dd>
        </div>
        {event.collection ? (
          <div>
            <dt>Раздел</dt>
            <dd>{COLLECTION_LABELS[event.collection as Collection] ?? event.collection}</dd>
          </div>
        ) : null}
      </dl>

      {hasSnapshots ? (
        <>
          <div className="history-diff-toolbar">
            <label className="history-unchanged-toggle">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              Показать без изменений
            </label>
          </div>
          <div className="diff-list">
            {diffs.length === 0 ? (
              <div className="empty-hint table-empty">Нет отличий в снимках</div>
            ) : (
              diffs.map((row) => <DiffBlock key={row.key} row={row} />)
            )}
          </div>
        </>
      ) : (
        <div className="empty-hint table-empty">Для этой записи нет снимков before/after</div>
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
