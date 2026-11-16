import { NavLink, Outlet } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import {
  IconBell,
  IconClients,
  IconDocs,
  IconDomains,
  IconFinance,
  IconHistory,
  IconHome,
  IconProjects,
  IconRefresh,
  IconSeo,
  IconServers,
  IconSettings,
} from '../components/Icons'
import { TopbarSearch } from '../components/TopbarSearch'
import { APP_VERSION } from '../version'
import { useVault } from '../vault/VaultContext'

const nav = [
  { to: '/', label: 'Главная', icon: IconHome, end: true },
  { to: '/projects', label: 'Проекты', icon: IconProjects },
  { to: '/servers', label: 'Серверы', icon: IconServers },
  { to: '/domains', label: 'Домены и DNS', icon: IconDomains },
  { to: '/seo', label: 'SEO', icon: IconSeo },
  { to: '/clients', label: 'Клиенты', icon: IconClients },
  { to: '/docs', label: 'Документация', icon: IconDocs },
  { to: '/finance', label: 'Финансы', icon: IconFinance },
  { to: '/history', label: 'История', icon: IconHistory },
  { to: '/updates', label: 'Обновление', icon: IconRefresh },
  { to: '/settings', label: 'Настройки', icon: IconSettings },
]

export function AppLayout() {
  const { prefs, lock } = useVault()
  const initial = prefs.profileName.trim().charAt(0).toUpperCase() || 'N'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark />
          <div className="brand-text">
            <strong>LCC</strong>
            <span>Loomixx Control Center</span>
          </div>
        </div>

        <nav className="nav">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="theme-toggle" type="button" title="Тема" aria-label="Тема">
            <span>☀</span>
          </button>
          <span className="version">v{APP_VERSION}</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <TopbarSearch />
          <div className="topbar-actions">
            <button className="icon-btn" type="button" aria-label="Уведомления">
              <IconBell />
              <i className="dot" />
            </button>
            <button className="btn btn-ghost" type="button" onClick={lock}>
              Lock
            </button>
            <div className="user-chip">
              <div className="avatar">{initial}</div>
              <strong>{prefs.profileName}</strong>
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
