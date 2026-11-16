import { useCallback } from 'react'
import { TableSkeleton } from '../components/Skeleton'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import { useCollection } from '../vault/useCollection'

export function SeoPage() {
  const { items, loading } = useCollection('campaigns')
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((c) => c.id === id), [items]),
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SEO и реклама</h1>
          <p>Кампании, позиции и заметки по продвижению</p>
        </div>
      </div>

      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Кампания</th>
                <th>Площадка</th>
                <th>Проект</th>
                <th>Бюджет</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  data-entity-id={c.id}
                  className={highlightId === c.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.platform}</td>
                  <td>{c.project}</td>
                  <td>{c.budget}</td>
                  <td>
                    <span className={`badge badge-${c.statusKind}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
