import { useCallback } from 'react'
import { TableSkeleton } from '../components/Skeleton'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import { useCollection } from '../vault/useCollection'

export function FinancePage() {
  const { items, loading } = useCollection('finance')
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((row) => row.id === id), [items]),
  )
  const total = items.reduce((sum, row) => sum + row.amount, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Финансы</h1>
          <p>Расходы на инфраструктуру, домены и сервисы</p>
        </div>
      </div>

      <div className="grid-cards">
        <article className="card entity-card">
          <div className="top">
            <h3>Всего в vault</h3>
          </div>
          {loading ? (
            <div className="skeleton-line skeleton-title" style={{ width: '40%' }} />
          ) : (
            <>
              <div className="money">{total.toLocaleString('ru-RU')} ₽</div>
              <p>{items.length} записей</p>
            </>
          )}
        </article>
      </div>

      <div className="card table-card" style={{ marginTop: 16 }}>
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Статья</th>
                <th>Категория</th>
                <th>Проект</th>
                <th>Сумма</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  data-entity-id={row.id}
                  className={highlightId === row.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{row.title}</strong>
                  </td>
                  <td>{row.category}</td>
                  <td>{row.project}</td>
                  <td>{row.amount.toLocaleString('ru-RU')} ₽</td>
                  <td>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
