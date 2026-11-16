import { useEffect, useState } from 'react'
import {
  githubCommits,
  githubPulls,
  githubRepo,
  GithubError,
  type GithubCommitInfo,
  type GithubPullInfo,
  type GithubRepoInfo,
} from '../github/client'
import { githubWebUrl } from '../github/repo'
import type { Project } from '../vault/types'
import { useVault } from '../vault/VaultContext'

function formatWhen(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function ProjectGithubPanel({ project }: { project: Project }) {
  const { githubLogin, readGithubToken } = useVault()
  const owner = project.github?.owner ?? ''
  const repo = project.github?.repo ?? ''
  const link = owner && repo ? { owner, repo } : null
  const [info, setInfo] = useState<GithubRepoInfo | null>(null)
  const [commits, setCommits] = useState<GithubCommitInfo[]>([])
  const [pulls, setPulls] = useState<GithubPullInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!link) return
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    setInfo(null)
    setCommits([])
    setPulls([])
    void (async () => {
      try {
        const token = await readGithubToken()
        const [repo, commitRows, pullRows] = await Promise.all([
          githubRepo(link, token, ctrl.signal),
          githubCommits(link, token, ctrl.signal),
          githubPulls(link, token, ctrl.signal).catch(() => [] as GithubPullInfo[]),
        ])
        if (ctrl.signal.aborted) return
        setInfo(repo)
        setCommits(commitRows)
        setPulls(pullRows)
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof GithubError || err instanceof Error ? err.message : 'GitHub недоступен')
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [owner, repo, githubLogin, readGithubToken])

  if (!link) {
    return (
      <div className="card empty-hint project-placeholder">
        <h2 className="panel-title">Деплой</h2>
        <p>Привяжите репозиторий в карточке проекта: owner/repo или ссылка github.com.</p>
      </div>
    )
  }

  const href = githubWebUrl(link)

  return (
    <div className="github-feed">
      <div className="card project-detail-card">
        <div className="detail-badge-row">
          <span className="badge badge-lime">GitHub</span>
          {info?.private ? <span className="badge badge-amber">Private</span> : <span className="badge badge-green">Public</span>}
          {githubLogin ? <span className="badge badge-blue">{githubLogin}</span> : <span className="badge badge-amber">Без токена</span>}
        </div>
        <h2 className="panel-title" style={{ marginTop: 12 }}>
          <a href={href} target="_blank" rel="noreferrer noopener">
            {info?.fullName ?? `${link.owner}/${link.repo}`}
          </a>
        </h2>
        <p className="detail-note">{loading ? 'Читаем репозиторий…' : info?.description || 'Без описания'}</p>
        {error ? <div className="unlock-error">{error}</div> : null}
        {info ? (
          <div className="kv detail-kv">
            <div>
              <small>Ветка</small>
              <strong>{info.defaultBranch}</strong>
            </div>
            <div>
              <small>Открытые PR</small>
              <strong>{pulls.length || info.openIssues}</strong>
            </div>
            <div>
              <small>Последний push</small>
              <strong>{formatWhen(info.pushedAt) || '—'}</strong>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>Последние коммиты</h3>
        {loading ? (
          <p>Загрузка…</p>
        ) : commits.length === 0 ? (
          <p>Коммитов не видно. Для приватного репозитория сохраните токен в настройках.</p>
        ) : (
          <ul className="github-list">
            {commits.map((commit, index) => (
              <li key={commit.sha} className="github-row" style={{ animationDelay: `${index * 40}ms` }}>
                <code>{commit.sha.slice(0, 7)}</code>
                <a href={commit.url} target="_blank" rel="noreferrer noopener">
                  {commit.message}
                </a>
                <span>
                  {commit.author}
                  {commit.date ? ` · ${formatWhen(commit.date)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Открытые pull request</h3>
        {pulls.length === 0 ? (
          <p>Открытых PR нет.</p>
        ) : (
          <ul className="github-list">
            {pulls.map((pull) => (
              <li key={pull.number} className="github-row">
                <code>#{pull.number}</code>
                <a href={pull.url} target="_blank" rel="noreferrer noopener">
                  {pull.title}
                </a>
                <span>{pull.author}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
