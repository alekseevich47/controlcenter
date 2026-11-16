import { Link } from 'react-router-dom'
import { DashboardSkeleton } from '../components/Skeleton'
import { SlimeHero } from '../components/SlimeHero'
import { badgeClass, isArchived, normalizeProjectStatus, statusKindFor } from '../vault/projectStatus'
import { useCollection } from '../vault/useCollection'

const actions = [
  { label: 'Добавить проект', color: '#4b8cff', to: '/projects' },
  { label: 'Добавить сервер', color: '#22a35a', to: '/servers' },
  { label: 'Добавить клиента', color: '#8b6cf0', to: '/clients' },
  { label: 'Добавить домен', color: '#e2a008', to: '/domains' },
  { label: 'Создать заметку', color: '#e25555', to: '/docs' },
  { label: 'Открыть SEO', color: '#1a1d27', to: '/seo' },
]

export function HomePage() {
  const { items: projects, loading: lp } = useCollection('projects')
  const { items: servers, loading: ls } = useCollection('servers')
  const { items: events, loading: le } = useCollection('events')
  const { items: finance, loading: lf } = useCollection('finance')
  const { items: docs, loading: ld } = useCollection('docs')

  const loading = lp || ls || le || lf || ld
  const financeTotal = finance.reduce((s, r) => s + r.amount, 0)
  const liveProjects = projects.filter((p) => !isArchived(p))

  if (loading) return <DashboardSkeleton />

  return (
    <div className="dash-grid">
      <section className="card hero area-hero">
        <SlimeHero />
        <div className="hero-copy">
          <div className="eyebrow">loomixx · studio OS</div>
          <h2>Loomixx Control Center</h2>
          <p>Ваш центр управления проектами и инфраструктурой</p>
          <Link className="btn btn-primary" to="/projects">
            Перейти к проектам
          </Link>
        </div>
      </section>

      <section className="card actions-card area-actions">
        <h3>Быстрые действия</h3>
        <div className="actions-grid">
          {actions.map((a) => (
            <Link key={a.label} className="action-tile" to={a.to}>
              <div className="ico" style={{ background: a.color }}>
                +
              </div>
              <span>{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card panel area-projects">
        <div className="panel-head">
          <h3>Проекты</h3>
          <span className="badge badge-lime">{liveProjects.length} в vault</span>
        </div>
        <div className="stat-row">
          <div className="big">{liveProjects.length}</div>
          <div className="chart-bars" aria-hidden>
            <i style={{ height: '42%' }} />
            <i style={{ height: '68%' }} />
            <i style={{ height: '55%' }} />
            <i style={{ height: '88%' }} />
            <i style={{ height: '72%' }} />
          </div>
        </div>
        <div className="list">
          {liveProjects.slice(0, 3).map((p) => {
            const status = normalizeProjectStatus(p.status)
            const kind = statusKindFor(status)
            return (
              <div className="list-row" key={p.id}>
                <div className="meta">
                  <strong>{p.name}</strong>
                  <small>{p.domain}</small>
                </div>
                <span className={`badge ${badgeClass(kind)}`}>{status}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card panel area-servers">
        <div className="panel-head">
          <h3>Серверы</h3>
          <span className="badge badge-green">{servers.length}</span>
        </div>
        <svg className="spark" viewBox="0 0 220 56" preserveAspectRatio="none" aria-hidden>
          <path
            d="M0 40 C20 38, 30 22, 50 28 S80 48, 110 30 S150 8, 180 22 S210 40, 220 28"
            fill="none"
            stroke="#9fd412"
            strokeWidth="3"
          />
          <path
            d="M0 40 C20 38, 30 22, 50 28 S80 48, 110 30 S150 8, 180 22 S210 40, 220 28 L220 56 L0 56 Z"
            fill="rgba(198,245,61,0.22)"
          />
        </svg>
        <div className="list">
          {servers.slice(0, 3).map((s) => (
            <div className="list-row" key={s.id}>
              <div className="meta">
                <i className={`dot-status${s.statusKind === 'amber' ? ' warn' : ''}`} />
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.specs}</small>
                </div>
              </div>
              <span className={`badge badge-${s.statusKind}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card panel area-seo">
        <div className="panel-head">
          <h3>SEO и продвижение</h3>
          <span className="badge badge-lime">vault</span>
        </div>
        <div className="progress">
          <div className="progress-item">
            <label>
              <span>Яндекс</span>
              <span>78%</span>
            </label>
            <div className="track">
              <i style={{ width: '78%' }} />
            </div>
          </div>
          <div className="progress-item">
            <label>
              <span>Google</span>
              <span>64%</span>
            </label>
            <div className="track">
              <i style={{ width: '64%' }} />
            </div>
          </div>
        </div>
      </section>

      <section className="card panel area-events">
        <div className="panel-head">
          <h3>Последние события</h3>
        </div>
        <div className="timeline">
          {events.slice(0, 4).map((e) => (
            <div className="timeline-item" key={e.id}>
              <div className="rail">
                <i />
              </div>
              <div>
                <strong>{e.title}</strong>
                <small>{e.when}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card panel area-finance">
        <div className="panel-head">
          <h3>Финансы</h3>
        </div>
        <div className="finance-grid">
          <div>
            <div className="money">{financeTotal.toLocaleString('ru-RU')} ₽</div>
            <small style={{ color: 'var(--muted)' }}>по записям vault</small>
          </div>
          <div className="split-list">
            {finance.slice(0, 3).map((f) => (
              <div key={f.id}>
                <span>{f.category}</span>
                <strong>{f.amount.toLocaleString('ru-RU')} ₽</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card panel area-docs">
        <div className="panel-head">
          <h3>Документация</h3>
          <span className="badge badge-lime">{docs.length} файла</span>
        </div>
        <div className="docs-card">
          <div className="docs-links">
            {docs.slice(0, 3).map((d) => (
              <Link key={d.id} to="/docs">
                {d.title}
              </Link>
            ))}
          </div>
          <div className="book-illus" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13l-4-2-4 2V7A2.5 2.5 0 0 0 6.5 4.5H5"
                stroke="#1a1d27"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M5 4.5v15.5" stroke="#1a1d27" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      <section className="card status-bar area-status">
        <div className="ok">
          <span className="check">✓</span>
          Vault разблокирован · данные локально
        </div>
        <small>Шифрование AES-GCM</small>
      </section>
    </div>
  )
}
