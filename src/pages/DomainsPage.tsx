import { useCallback } from 'react'
import { IconPlus } from '../components/Icons'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'

export function DomainsPage() {
  const { items, loading } = useCollection('domains')
  const { put } = useVault()
  const { notify } = useToast()
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((d) => d.id === id), [items]),
  )

  async function add() {
    const id = `dom-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    await put('domains', {
      id,
      createdAt: now,
      updatedAt: now,
      domain: 'example.ru',
      registrar: '—',
      dns: '—',
      expires: '—',
      ssl: 'нет',
      project: '—',
    })
    notify({ message: 'Домен добавлен', tone: 'success' })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Домены и DNS</h1>
          <p>Регистраторы, NS, SSL и даты продления</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void add()}>
          <IconPlus /> Добавить домен
        </button>
      </div>

      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Домен</th>
                <th>Проект</th>
                <th>Регистратор</th>
                <th>DNS</th>
                <th>SSL</th>
                <th>Продление</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr
                  key={d.id}
                  data-entity-id={d.id}
                  className={highlightId === d.id ? 'entity-focus' : undefined}
                >
                  <td>
                    <strong>{d.domain}</strong>
                  </td>
                  <td>{d.project}</td>
                  <td>{d.registrar}</td>
                  <td>{d.dns}</td>
                  <td>{d.ssl}</td>
                  <td>{d.expires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
