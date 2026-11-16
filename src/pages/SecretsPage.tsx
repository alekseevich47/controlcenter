import { SecretsSkeleton } from '../components/Skeleton'
import { useCollection } from '../vault/useCollection'

export function SecretsPage() {
  const { items, loading } = useCollection('secrets')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Секреты</h1>
          <p>В LCC — только ссылки и расположение. Значения в зашифрованных файлах vault</p>
        </div>
      </div>

      {loading ? (
        <SecretsSkeleton />
      ) : (
        <div className="card">
          {items.map((s) => (
            <div className="secret-row" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <div className="mono">{s.place}</div>
              </div>
              <span className="badge badge-lime">{s.project}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
