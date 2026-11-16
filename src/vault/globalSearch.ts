import {
  contactsSummary,
  haystackContacts,
  normalizeClient,
  primaryContactLine,
} from './clientContacts'
import { isArchived } from './projectStatus'
import type {
  Campaign,
  Client,
  Collection,
  CollectionMap,
  Doc,
  Domain,
  FinanceEntry,
  Project,
  Server,
} from './types'

/** Коллекции, участвующие в глобальном поиске (не история, не секреты). */
export const SEARCHABLE_COLLECTIONS = [
  'projects',
  'servers',
  'domains',
  'campaigns',
  'clients',
  'docs',
  'finance',
] as const satisfies readonly Collection[]

export type SearchableCollection = (typeof SEARCHABLE_COLLECTIONS)[number]

export type SearchSectionMeta = {
  label: string
  to: string
  badge: 'lime' | 'green' | 'blue' | 'amber' | 'purple' | 'red'
}

export const SEARCH_SECTIONS: Record<SearchableCollection, SearchSectionMeta> = {
  projects: { label: 'Проекты', to: '/projects', badge: 'blue' },
  servers: { label: 'Серверы', to: '/servers', badge: 'green' },
  domains: { label: 'Домены', to: '/domains', badge: 'amber' },
  campaigns: { label: 'SEO', to: '/seo', badge: 'purple' },
  clients: { label: 'Клиенты', to: '/clients', badge: 'lime' },
  docs: { label: 'Документация', to: '/docs', badge: 'blue' },
  finance: { label: 'Финансы', to: '/finance', badge: 'amber' },
}

export type SearchHit = {
  key: string
  id: string
  collection: SearchableCollection
  title: string
  subtitle: string
  sectionLabel: string
  badge: SearchSectionMeta['badge']
  to: string
}

const MAX_HITS = 40

function norm(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function joinHay(...parts: unknown[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : p == null ? '' : String(p)))
    .join(' ')
    .toLowerCase()
}

function hit(
  collection: SearchableCollection,
  id: string,
  title: string,
  subtitle: string,
  haystack: string,
  query: string,
): SearchHit | null {
  if (!haystack.includes(query)) return null
  const section = SEARCH_SECTIONS[collection]
  const safeId = id.replace(/[/\\]/g, '').slice(0, 128)
  if (!safeId) return null
  return {
    key: `${collection}:${safeId}`,
    id: safeId,
    collection,
    title: title.trim() || 'Без названия',
    subtitle,
    sectionLabel: section.label,
    badge: section.badge,
    // Deep-link: страница раздела читает ?id= и открывает объект
    to: `${section.to}?id=${encodeURIComponent(safeId)}`,
  }
}

function searchProjects(items: Project[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const p of items) {
    const archived = isArchived(p)
    const found = hit(
      'projects',
      p.id,
      p.name,
      [p.status, p.client, p.domain, p.github ? `${p.github.owner}/${p.github.repo}` : '', archived ? 'Архив' : '']
        .filter(Boolean)
        .join(' · '),
      joinHay(
        p.name,
        p.status,
        p.stack,
        p.client,
        p.domain,
        p.note,
        p.github ? `${p.github.owner}/${p.github.repo}` : '',
        p.tags,
        archived ? 'архив' : '',
      ),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchServers(items: Server[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const s of items) {
    const found = hit(
      'servers',
      s.id,
      s.name,
      [s.host, s.role, s.status].filter(Boolean).join(' · '),
      joinHay(s.name, s.host, s.specs, s.role, s.status, s.notes, s.tags),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchDomains(items: Domain[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const d of items) {
    const found = hit(
      'domains',
      d.id,
      d.domain,
      [d.registrar, d.project, d.ssl].filter(Boolean).join(' · '),
      joinHay(d.domain, d.registrar, d.dns, d.expires, d.ssl, d.project, d.notes, d.tags),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchCampaigns(items: Campaign[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const c of items) {
    const found = hit(
      'campaigns',
      c.id,
      c.name,
      [c.platform, c.project, c.status].filter(Boolean).join(' · '),
      joinHay(c.name, c.platform, c.project, c.budget, c.status, c.notes, c.tags),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchClients(items: Client[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const c of items) {
    const n = normalizeClient(c)
    const summary = contactsSummary(n.contacts)
    const found = hit(
      'clients',
      n.id,
      n.name,
      [primaryContactLine(n), summary].filter((s) => s && s !== '—').join(' · '),
      joinHay(
        n.name,
        n.id,
        n.note,
        n.projects,
        n.tags,
        haystackContacts(n.contacts),
        typeof c.contact === 'string' ? c.contact : '',
        typeof c.channels === 'string' ? c.channels : '',
      ),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchDocs(items: Doc[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const d of items) {
    const bodySlice =
      typeof d.body === 'string' && d.body.length > 0 ? d.body.slice(0, 2000) : ''
    const found = hit(
      'docs',
      d.id,
      d.title,
      [d.type, d.project].filter(Boolean).join(' · '),
      joinHay(d.title, d.type, d.project, bodySlice, d.notes, d.tags),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

function searchFinance(items: FinanceEntry[], q: string): SearchHit[] {
  const out: SearchHit[] = []
  for (const f of items) {
    const found = hit(
      'finance',
      f.id,
      f.title,
      [f.category, f.project, f.date].filter(Boolean).join(' · '),
      joinHay(f.title, f.category, f.project, f.date, f.amount, f.notes, f.tags),
      q,
    )
    if (found) out.push(found)
  }
  return out
}

export type SearchCatalog = {
  [C in SearchableCollection]: CollectionMap[C][]
}

/** Чистый поиск по уже загруженному каталогу. Без побочных эффектов. */
export function searchCatalog(catalog: SearchCatalog, rawQuery: string): SearchHit[] {
  const q = norm(rawQuery)
  if (!q) return []

  const hits: SearchHit[] = [
    ...searchProjects(catalog.projects, q),
    ...searchServers(catalog.servers, q),
    ...searchDomains(catalog.domains, q),
    ...searchCampaigns(catalog.campaigns, q),
    ...searchClients(catalog.clients, q),
    ...searchDocs(catalog.docs, q),
    ...searchFinance(catalog.finance, q),
  ]

  return hits.slice(0, MAX_HITS)
}

export function emptyCatalog(): SearchCatalog {
  return {
    projects: [],
    servers: [],
    domains: [],
    campaigns: [],
    clients: [],
    docs: [],
    finance: [],
  }
}
