import type { GithubRepoLink } from '../vault/types'

/** GitHub login: 1–39 символов, без ведущего/конечного дефиса. */
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._-]{1,100}$/

/**
 * Принимает `owner/repo` или URL github.com.
 * Лишние сегменты (issues, pulls) отклоняются — в API уходит только slug.
 */
export function parseGithubRepo(input: string): GithubRepoLink | null {
  let raw = input.trim()
  if (!raw || raw.length > 300) return null
  raw = raw.replace(/\.git$/i, '')
  raw = raw.replace(/\/+$/, '')
  raw = raw.replace(/^https?:\/\//i, '')
  raw = raw.replace(/^www\./i, '')
  raw = raw.replace(/^github\.com\//i, '')
  raw = raw.replace(/^\/+/, '')
  if (raw.includes('?') || raw.includes('#') || raw.includes('\\') || raw.includes('@')) {
    return null
  }
  const parts = raw.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  const owner = parts[0] ?? ''
  const repo = parts[1] ?? ''
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null
  return { owner, repo }
}

export function formatGithubRepo(link: GithubRepoLink | null | undefined): string {
  if (!link?.owner || !link.repo) return ''
  return `${link.owner}/${link.repo}`
}

export function githubWebUrl(link: GithubRepoLink): string {
  return `https://github.com/${link.owner}/${link.repo}`
}

export function isGithubRepoLink(value: unknown): value is GithubRepoLink {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.owner === 'string' &&
    typeof row.repo === 'string' &&
    parseGithubRepo(`${row.owner}/${row.repo}`) !== null &&
    Object.keys(row).every((key) => key === 'owner' || key === 'repo')
  )
}
