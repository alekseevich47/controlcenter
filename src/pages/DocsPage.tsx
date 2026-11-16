import { useCallback } from 'react'
import { IconPlus } from '../components/Icons'
import { CardsSkeleton } from '../components/Skeleton'
import { useToast } from '../components/ToastProvider'
import { useSearchHighlight } from '../hooks/useSearchFocus'
import { useCollection } from '../vault/useCollection'
import { useVault } from '../vault/VaultContext'

export function DocsPage() {
  const { items, loading } = useCollection('docs')
  const { put } = useVault()
  const { notify } = useToast()
  const highlightId = useSearchHighlight(
    !loading,
    useCallback((id) => items.some((d) => d.id === id), [items]),
  )

  async function add() {
    const id = `doc-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    await put('docs', {
      id,
      createdAt: now,
      updatedAt: now,
      title: 'Новый документ',
      type: 'Заметка',
      project: 'Студия',
      body: '',
    })
    notify({ message: 'Документ создан', tone: 'success' })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Документация</h1>
          <p>Инструкции, договоры и ops-доки по проектам</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void add()}>
          <IconPlus /> Новый документ
        </button>
      </div>

      {loading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid-cards">
          {items.map((d) => (
            <article
              key={d.id}
              data-entity-id={d.id}
              className={`card entity-card${highlightId === d.id ? ' entity-focus' : ''}`}
            >
              <div className="top">
                <h3>{d.title}</h3>
                <span className="badge badge-lime">{d.type}</span>
              </div>
              <p>Обновлено: {new Date(d.updatedAt).toLocaleString('ru-RU')}</p>
              <div className="kv">
                <div style={{ gridColumn: '1 / -1' }}>
                  <small>Проект</small>
                  <strong>{d.project}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
