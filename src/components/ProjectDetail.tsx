import { Children, useMemo, useState, type ReactNode } from 'react'
import {
  badgeClass,
  isArchived,
  normalizeProjectStatus,
  statusKindFor,
} from '../vault/projectStatus'
import type { EntityBase, Project } from '../vault/types'
import { useCollection } from '../vault/useCollection'
import { IconArchive, IconEdit, IconPin, IconTrash } from './Icons'
import { ProjectEventsPreview, ProjectHistoryPanel } from './ProjectHistory'
import { ProjectGithubPanel } from './ProjectGithubPanel'
import { ServersPanel } from './ServersPanel'
import { SecretsSkeleton, TableSkeleton } from './Skeleton'

type ProjectTabId =
  | 'home'
  | 'servers'
  | 'domains'
  | 'secrets'
  | 'deploy'
  | 'seo'
  | 'ads'
  | 'docs'
  | 'finance'
  | 'history'

const PROJECT_TABS: { id: ProjectTabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'servers', label: 'Серверы' },
  { id: 'domains', label: 'Домены' },
  { id: 'secrets', label: 'Секреты' },
  { id: 'deploy', label: 'Деплой' },
  { id: 'seo', label: 'SEO' },
  { id: 'ads', label: 'Реклама' },
  { id: 'docs', label: 'Документы' },
  { id: 'finance', label: 'Финансы' },
  { id: 'history', label: 'История' },
]

interface ProjectDetailProps {
  project: Project
  onBack: () => void
  onEdit: () => void
  onTogglePin: () => void
  onToggleArchive: () => void
  onDelete: () => void
}

function belongsToProject(
  entity: EntityBase & { project?: string },
  project: Project,
): boolean {
  if (entity.projectId) return entity.projectId === project.id
  if (entity.project) {
    return entity.project === project.name || entity.project === project.id
  }
  return false
}

export function ProjectDetail({
  project,
  onBack,
  onEdit,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: ProjectDetailProps) {
  const [tab, setTab] = useState<ProjectTabId>('home')
  const status = normalizeProjectStatus(project.status)
  const kind = statusKindFor(status)
  const archived = isArchived(project)

  const tabMeta = PROJECT_TABS.find((t) => t.id === tab) ?? PROJECT_TABS[0]

  return (
    <div className="project-detail">
      <div className="project-tabs" role="tablist" aria-label="Разделы проекта">
        {PROJECT_TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`project-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`project-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              className={`project-tab${active ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="page-head project-detail-head">
        <div>
          <button className="btn btn-ghost detail-back" type="button" onClick={onBack}>
            ← К списку
          </button>
          <h1 className="detail-title">
            {project.name}
            {project.pinned ? (
              <span className="pin-mark" title="Закреплён">
                <IconPin />
              </span>
            ) : null}
          </h1>
          <p>
            {tab === 'home'
              ? 'Паспорт проекта, действия и события'
              : tab === 'history'
                ? 'История обновлений проекта'
                : tabMeta.label}
          </p>
        </div>
        {tab === 'home' && (
          <div className="detail-actions">
            {!archived && (
              <>
                <button className="btn btn-ghost" type="button" onClick={onEdit}>
                  <IconEdit /> Редактировать
                </button>
                <button className="btn btn-ghost" type="button" onClick={onTogglePin}>
                  <IconPin /> {project.pinned ? 'Открепить' : 'Закрепить'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={onToggleArchive}>
                  <IconArchive /> В архив
                </button>
              </>
            )}
            {archived && (
              <button className="btn btn-primary" type="button" onClick={onToggleArchive}>
                <IconArchive /> Из архива
              </button>
            )}
            <button className="btn btn-danger" type="button" onClick={onDelete}>
              <IconTrash /> Удалить
            </button>
          </div>
        )}
      </div>

      <div
        className="project-tab-stage"
        role="tabpanel"
        id={`project-panel-${tab}`}
        aria-labelledby={`project-tab-${tab}`}
        key={tab}
      >
        {tab === 'home' && (
          <>
            <HomePassport
              project={project}
              status={status}
              kind={kind}
              archived={archived}
            />
            <ProjectEventsPreview project={project} />
          </>
        )}
        {tab === 'servers' && (
          <ServersPanel
            projectId={project.id}
            title="Серверы проекта"
            subtitle="Хосты, привязанные к этому проекту"
            compactHead
          />
        )}
        {tab === 'domains' && <ProjectDomains project={project} />}
        {tab === 'secrets' && <ProjectSecrets project={project} />}
        {tab === 'deploy' && <ProjectGithubPanel project={project} />}
        {tab === 'seo' && <ProjectCampaigns project={project} mode="seo" />}
        {tab === 'ads' && <ProjectCampaigns project={project} mode="ads" />}
        {tab === 'docs' && <ProjectDocs project={project} />}
        {tab === 'finance' && <ProjectFinance project={project} />}
        {tab === 'history' && <ProjectHistoryPanel project={project} />}
      </div>
    </div>
  )
}

function HomePassport({
  project,
  status,
  kind,
  archived,
}: {
  project: Project
  status: string
  kind: ReturnType<typeof statusKindFor>
  archived: boolean
}) {
  return (
    <div className="card project-detail-card">
      <div className="detail-badge-row">
        <span className={`badge ${badgeClass(kind)}`}>
          {status === 'Удален' ? 'Архив' : status}
        </span>
        {archived && <span className="badge badge-amber">В архиве</span>}
        {project.pinned && !archived && <span className="badge badge-lime">Закреплён</span>}
      </div>

      <p className="detail-note">{project.note || 'Без описания'}</p>

      <div className="kv detail-kv">
        <div>
          <small>Клиент</small>
          <strong>{project.client}</strong>
        </div>
        <div>
          <small>Домен</small>
          <strong>{project.domain}</strong>
        </div>
        <div>
          <small>GitHub</small>
          <strong>
            {project.github?.owner && project.github.repo ? (
              <a
                href={`https://github.com/${project.github.owner}/${project.github.repo}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {project.github.owner}/{project.github.repo}
              </a>
            ) : (
              '—'
            )}
          </strong>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <small>Стек</small>
          <strong>{project.stack}</strong>
        </div>
        <div>
          <small>Создан</small>
          <strong>{formatDate(project.createdAt)}</strong>
        </div>
        <div>
          <small>Обновлён</small>
          <strong>{formatDate(project.updatedAt)}</strong>
        </div>
        {project.deletedAt && (
          <div style={{ gridColumn: '1 / -1' }}>
            <small>В архиве с</small>
            <strong>{formatDate(project.deletedAt)}</strong>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <small>ID</small>
          <strong className="mono">{project.id}</strong>
        </div>
      </div>
    </div>
  )
}

function ProjectDomains({ project }: { project: Project }) {
  const { items, loading } = useCollection('domains')
  const rows = useMemo(
    () => items.filter((d) => belongsToProject(d, project)),
    [items, project],
  )

  return (
    <ScopedTable
      title="Домены"
      subtitle="Регистраторы, NS и SSL проекта"
      loading={loading}
      empty="Нет доменов, привязанных к проекту"
      cols={5}
      head={
        <>
          <th>Домен</th>
          <th>Регистратор</th>
          <th>DNS</th>
          <th>SSL</th>
          <th>Продление</th>
        </>
      }
    >
      {rows.map((d) => (
        <tr key={d.id}>
          <td>
            <strong>{d.domain}</strong>
          </td>
          <td>{d.registrar}</td>
          <td>{d.dns}</td>
          <td>{d.ssl}</td>
          <td>{d.expires}</td>
        </tr>
      ))}
    </ScopedTable>
  )
}

function ProjectSecrets({ project }: { project: Project }) {
  const { items, loading } = useCollection('secrets')
  const rows = useMemo(
    () => items.filter((s) => belongsToProject(s, project)),
    [items, project],
  )

  return (
    <>
      <div className="page-head page-head-compact">
        <div>
          <h2 className="panel-title">Секреты</h2>
          <p>Ссылки и расположение в vault — без значений в UI</p>
        </div>
      </div>
      {loading ? (
        <SecretsSkeleton />
      ) : rows.length === 0 ? (
        <div className="card empty-hint">Нет секретов, привязанных к проекту</div>
      ) : (
        <div className="card">
          {rows.map((s) => (
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

function ProjectCampaigns({
  project,
  mode,
}: {
  project: Project
  mode: 'seo' | 'ads'
}) {
  const { items, loading } = useCollection('campaigns')
  const rows = useMemo(
    () =>
      items.filter((c) => {
        if (!belongsToProject(c, project)) return false
        if (!c.channel) return true
        return c.channel === mode
      }),
    [items, project, mode],
  )

  return (
    <ScopedTable
      title={mode === 'seo' ? 'SEO' : 'Реклама'}
      subtitle={
        mode === 'seo'
          ? 'Кампании и заметки по продвижению проекта'
          : 'Платные кампании и бюджеты проекта'
      }
      loading={loading}
      empty={
        mode === 'seo'
          ? 'Нет SEO-записей по проекту'
          : 'Нет рекламных кампаний по проекту'
      }
      cols={4}
      head={
        <>
          <th>Кампания</th>
          <th>Площадка</th>
          <th>Бюджет</th>
          <th>Статус</th>
        </>
      }
    >
      {rows.map((c) => (
        <tr key={c.id}>
          <td>
            <strong>{c.name}</strong>
          </td>
          <td>{c.platform}</td>
          <td>{c.budget}</td>
          <td>
            <span className={`badge badge-${c.statusKind}`}>{c.status}</span>
          </td>
        </tr>
      ))}
    </ScopedTable>
  )
}

function ProjectDocs({ project }: { project: Project }) {
  const { items, loading } = useCollection('docs')
  const rows = useMemo(
    () => items.filter((d) => belongsToProject(d, project)),
    [items, project],
  )

  return (
    <ScopedTable
      title="Документы"
      subtitle="Инструкции и материалы проекта"
      loading={loading}
      empty="Нет документов по проекту"
      cols={2}
      head={
        <>
          <th>Документ</th>
          <th>Тип</th>
        </>
      }
    >
      {rows.map((d) => (
        <tr key={d.id}>
          <td>
            <strong>{d.title}</strong>
          </td>
          <td>{d.type}</td>
        </tr>
      ))}
    </ScopedTable>
  )
}

function ProjectFinance({ project }: { project: Project }) {
  const { items, loading } = useCollection('finance')
  const rows = useMemo(
    () => items.filter((f) => belongsToProject(f, project)),
    [items, project],
  )

  return (
    <ScopedTable
      title="Финансы"
      subtitle="Расходы и платежи проекта"
      loading={loading}
      empty="Нет финансовых записей по проекту"
      cols={4}
      head={
        <>
          <th>Статья</th>
          <th>Категория</th>
          <th>Сумма</th>
          <th>Дата</th>
        </>
      }
    >
      {rows.map((f) => (
        <tr key={f.id}>
          <td>
            <strong>{f.title}</strong>
          </td>
          <td>{f.category}</td>
          <td>{f.amount.toLocaleString('ru-RU')} ₽</td>
          <td>{f.date}</td>
        </tr>
      ))}
    </ScopedTable>
  )
}

function ScopedTable({
  title,
  subtitle,
  loading,
  empty,
  cols,
  head,
  children,
}: {
  title: string
  subtitle: string
  loading: boolean
  empty: string
  cols: number
  head: ReactNode
  children: ReactNode
}) {
  const childCount = Children.count(children)

  return (
    <>
      <div className="page-head page-head-compact">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="card table-card">
        {loading ? (
          <TableSkeleton cols={cols} />
        ) : childCount === 0 ? (
          <div className="empty-hint table-empty">{empty}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>{head}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
