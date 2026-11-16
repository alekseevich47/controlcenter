type CardsSkeletonProps = {
  count?: number
}

export function CardsSkeleton({ count = 6 }: CardsSkeletonProps) {
  return (
    <div className="grid-cards" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card entity-card skeleton-card">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-short" />
          <div className="skeleton-kv">
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
        </div>
      ))}
    </div>
  )
}

type TableSkeletonProps = {
  rows?: number
  cols?: number
}

export function TableSkeleton({ rows = 5, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="skeleton-table" aria-busy="true" aria-label="Загрузка">
      <div className="skeleton-table-head">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="skeleton-line skeleton-th" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skeleton-line" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-list-row">
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-short" />
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="dash-grid skeleton-dash" aria-busy="true" aria-label="Загрузка">
      <div className="card skeleton-panel area-hero">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-short" />
        <div className="skeleton-block skeleton-cta" />
      </div>
      <div className="card skeleton-panel area-actions">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-actions">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-block skeleton-tile" />
          ))}
        </div>
      </div>
      {['area-projects', 'area-servers', 'area-seo', 'area-events', 'area-finance', 'area-docs'].map(
        (area) => (
          <div key={area} className={`card skeleton-panel ${area}`}>
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-short" />
            <div className="skeleton-line" />
          </div>
        ),
      )}
      <div className="card skeleton-panel area-status">
        <div className="skeleton-line skeleton-short" />
      </div>
    </div>
  )
}

export function SecretsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="secret-row skeleton-secret">
          <div>
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-short" />
          </div>
          <div className="skeleton-block skeleton-badge" />
        </div>
      ))}
    </div>
  )
}
