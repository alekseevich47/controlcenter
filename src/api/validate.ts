import { normalizeClient } from '../vault/clientContacts'
import { isSafeEntityId } from '../vault/ids'
import { isGithubRepoLink, parseGithubRepo } from '../github/repo'
import { normalizeProjectStatus, statusKindFor } from '../vault/projectStatus'
import { normalizeServerStatus, serverStatusKind } from '../vault/serverStatus'
import type {
  Campaign,
  Client,
  CollectionMap,
  Doc,
  Domain,
  FinanceEntry,
  Project,
  SecretRef,
  Server,
} from '../vault/types'
import { ApiError } from './errors'

export const WRITABLE_COLLECTIONS = [
  'projects',
  'clients',
  'servers',
  'domains',
  'docs',
  'campaigns',
  'finance',
  'secrets',
] as const

export type WritableCollection = (typeof WRITABLE_COLLECTIONS)[number]

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'value',
  'secret',
  'password',
  'token',
  'credential',
  'credentials',
])

const PREFIX: Record<WritableCollection, string> = {
  projects: 'p',
  clients: 'cl',
  servers: 'srv',
  domains: 'dom',
  docs: 'doc',
  campaigns: 'cmp',
  finance: 'fin',
  secrets: 'sec',
}

export function newEntityId(collection: WritableCollection): string {
  return `${PREFIX[collection]}-${crypto.randomUUID().slice(0, 8)}`
}

export function assertPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'validation', 'Тело запроса должно быть JSON-объектом')
  }
  const row = value as Record<string, unknown>
  for (const key of Object.keys(row)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new ApiError(400, 'validation', 'Недопустимое поле в запросе')
    }
  }
  return row
}

function str(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

function requireText(value: unknown, max: number, label: string): string {
  const next = str(value, max)
  if (!next) throw new ApiError(400, 'validation', `Укажите ${label}`)
  return next
}

function optBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function tagsOf(value: unknown, fallback?: string[]): string[] | undefined {
  if (value === undefined) return fallback
  if (!Array.isArray(value)) return fallback
  const out: string[] = []
  for (const item of value) {
    if (out.length >= 12) break
    if (typeof item !== 'string') continue
    const tag = item.trim().slice(0, 40)
    if (tag) out.push(tag)
  }
  return out.length > 0 ? out : undefined
}

function notesOf(value: unknown, fallback?: string): string | undefined {
  if (value === undefined) return fallback
  const next = str(value, 2000)
  return next || undefined
}

function projectIdOf(value: unknown, fallback?: string): string | undefined {
  if (value === undefined) return fallback
  if (value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new ApiError(400, 'validation', 'projectId должен быть строкой')
  }
  const id = value.trim()
  if (!isSafeEntityId(id)) throw new ApiError(400, 'validation', 'Некорректный projectId')
  return id
}

export function githubFromInput(
  value: unknown,
  fallback: Project['github'],
): Project['github'] {
  if (value === undefined) return fallback ?? null
  if (value === null || value === '') return null
  if (typeof value === 'string') {
    const parsed = parseGithubRepo(value)
    if (!parsed) throw new ApiError(400, 'validation', 'Репозиторий: owner/repo или ссылка GitHub')
    return parsed
  }
  if (!isGithubRepoLink(value)) {
    throw new ApiError(400, 'validation', 'Репозиторий: { owner, repo }')
  }
  return { owner: value.owner, repo: value.repo }
}

function baseTimes(now: string, createdAt?: string) {
  return {
    createdAt: createdAt && !Number.isNaN(Date.parse(createdAt)) ? createdAt : now,
    updatedAt: now,
  }
}

function campaignChannel(value: unknown, fallback?: Campaign['channel']): Campaign['channel'] {
  if (value === undefined) return fallback
  if (value === null || value === '') return undefined
  if (value === 'seo' || value === 'ads') return value
  throw new ApiError(400, 'validation', 'channel: seo или ads')
}

function campaignKind(value: unknown, fallback: Campaign['statusKind']): Campaign['statusKind'] {
  if (value === undefined) return fallback
  if (value === 'green' || value === 'amber') return value
  throw new ApiError(400, 'validation', 'statusKind: green или amber')
}

export function buildProject(
  input: Record<string, unknown>,
  now: string,
  current?: Project,
): Project {
  const name = input.name === undefined && current
    ? current.name
    : requireText(input.name ?? current?.name, 120, 'название проекта')
  const statusRaw = input.status === undefined && current ? current.status : str(input.status, 40, 'Планирование')
  const status = normalizeProjectStatus(statusRaw || 'Планирование')
  const safeStatus = status === 'Удален' ? 'Планирование' : status
  const id = current?.id ?? newEntityId('projects')
  return {
    id,
    ...baseTimes(now, current?.createdAt),
    name,
    status: safeStatus,
    statusKind: statusKindFor(safeStatus),
    stack: input.stack === undefined && current ? current.stack : str(input.stack, 200) || '—',
    client: input.client === undefined && current ? current.client : str(input.client, 120) || '—',
    clientId:
      input.clientId === undefined && current
        ? (current.clientId ?? null)
        : input.clientId === null || input.clientId === ''
          ? null
          : typeof input.clientId === 'string' && isSafeEntityId(input.clientId.trim())
            ? input.clientId.trim()
            : input.clientId === undefined
              ? null
              : (() => {
                  throw new ApiError(400, 'validation', 'Некорректный clientId')
                })(),
    domain: input.domain === undefined && current ? current.domain : str(input.domain, 200) || '—',
    note: input.note === undefined && current ? current.note : str(input.note, 2000),
    pinned: optBool(input.pinned, current?.pinned ?? false),
    deletedAt:
      input.deletedAt === undefined
        ? (current?.deletedAt ?? null)
        : input.deletedAt === null || input.deletedAt === ''
          ? null
          : typeof input.deletedAt === 'string' && !Number.isNaN(Date.parse(input.deletedAt))
            ? input.deletedAt
            : (() => {
                throw new ApiError(400, 'validation', 'deletedAt должен быть датой ISO')
              })(),
    github: githubFromInput(input.github, current?.github ?? null),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildClient(
  input: Record<string, unknown>,
  now: string,
  current?: Client,
): Client {
  const id = current?.id ?? newEntityId('clients')
  const draft = {
    ...(current ?? {
      id,
      createdAt: now,
      updatedAt: now,
      name: '',
      note: '',
      contacts: undefined as Client['contacts'] | undefined,
    }),
    id,
    name: input.name === undefined && current ? current.name : requireText(input.name ?? current?.name, 120, 'имя клиента'),
    note: input.note === undefined && current ? current.note : str(input.note, 2000),
    contacts: (input.contacts === undefined ? current?.contacts : input.contacts) as Client['contacts'],
    projectIds: (input.projectIds === undefined ? current?.projectIds : input.projectIds) as Client['projectIds'],
    projects: current?.projects,
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  return normalizeClient(draft as Client)
}

export function buildServer(
  input: Record<string, unknown>,
  now: string,
  current?: Server,
): Server {
  const status = normalizeServerStatus(
    input.status === undefined && current ? current.status : str(input.status, 40, 'Online'),
  )
  return {
    id: current?.id ?? newEntityId('servers'),
    ...baseTimes(now, current?.createdAt),
    name: input.name === undefined && current ? current.name : requireText(input.name ?? current?.name, 120, 'имя сервера'),
    host: input.host === undefined && current ? current.host : str(input.host, 200) || '—',
    specs: input.specs === undefined && current ? current.specs : str(input.specs, 200) || '—',
    role: input.role === undefined && current ? current.role : str(input.role, 120) || '—',
    status,
    statusKind: serverStatusKind(status),
    projectId: projectIdOf(input.projectId, current?.projectId),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildDomain(
  input: Record<string, unknown>,
  now: string,
  current?: Domain,
): Domain {
  const domain =
    input.domain === undefined && current
      ? current.domain
      : requireText(input.domain ?? current?.domain, 200, 'домен')
  if (/[\s/\\]/.test(domain)) throw new ApiError(400, 'validation', 'Домен без пробелов и слешей')
  return {
    id: current?.id ?? newEntityId('domains'),
    ...baseTimes(now, current?.createdAt),
    domain,
    registrar: input.registrar === undefined && current ? current.registrar : str(input.registrar, 120) || '—',
    dns: input.dns === undefined && current ? current.dns : str(input.dns, 200) || '—',
    expires: input.expires === undefined && current ? current.expires : str(input.expires, 40) || '—',
    ssl: input.ssl === undefined && current ? current.ssl : str(input.ssl, 80) || 'нет',
    project: input.project === undefined && current ? current.project : str(input.project, 120) || '—',
    projectId: projectIdOf(input.projectId, current?.projectId),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildDoc(input: Record<string, unknown>, now: string, current?: Doc): Doc {
  return {
    id: current?.id ?? newEntityId('docs'),
    ...baseTimes(now, current?.createdAt),
    title: input.title === undefined && current ? current.title : requireText(input.title ?? current?.title, 160, 'название документа'),
    type: input.type === undefined && current ? current.type : str(input.type, 80) || 'Заметка',
    project: input.project === undefined && current ? current.project : str(input.project, 120) || '—',
    projectId: projectIdOf(input.projectId, current?.projectId),
    body: input.body === undefined && current ? current.body : str(input.body, 20_000),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildCampaign(
  input: Record<string, unknown>,
  now: string,
  current?: Campaign,
): Campaign {
  return {
    id: current?.id ?? newEntityId('campaigns'),
    ...baseTimes(now, current?.createdAt),
    name: input.name === undefined && current ? current.name : requireText(input.name ?? current?.name, 160, 'название кампании'),
    platform: input.platform === undefined && current ? current.platform : str(input.platform, 80) || '—',
    project: input.project === undefined && current ? current.project : str(input.project, 120) || '—',
    projectId: projectIdOf(input.projectId, current?.projectId),
    budget: input.budget === undefined && current ? current.budget : str(input.budget, 40) || '—',
    status: input.status === undefined && current ? current.status : str(input.status, 40) || 'Черновик',
    statusKind: campaignKind(input.statusKind, current?.statusKind ?? 'amber'),
    channel: campaignChannel(input.channel, current?.channel),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildFinance(
  input: Record<string, unknown>,
  now: string,
  current?: FinanceEntry,
): FinanceEntry {
  const amountSource = input.amount === undefined && current ? current.amount : input.amount
  const amount = typeof amountSource === 'number' ? amountSource : Number(amountSource)
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000) {
    throw new ApiError(400, 'validation', 'Сумма должна быть конечным числом')
  }
  return {
    id: current?.id ?? newEntityId('finance'),
    ...baseTimes(now, current?.createdAt),
    title:
      input.title === undefined && current
        ? current.title
        : requireText(input.title ?? current?.title, 160, 'статью'),
    category: input.category === undefined && current ? current.category : str(input.category, 80) || 'Прочее',
    project: input.project === undefined && current ? current.project : str(input.project, 120) || '—',
    projectId: projectIdOf(input.projectId, current?.projectId),
    amount: Math.round(amount * 100) / 100,
    date: input.date === undefined && current ? current.date : str(input.date, 32) || '—',
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export function buildSecret(
  input: Record<string, unknown>,
  now: string,
  current?: SecretRef,
): SecretRef {
  return {
    id: current?.id ?? newEntityId('secrets'),
    ...baseTimes(now, current?.createdAt),
    name: input.name === undefined && current ? current.name : requireText(input.name ?? current?.name, 120, 'название'),
    place: input.place === undefined && current ? current.place : requireText(input.place ?? current?.place, 200, 'где лежит секрет'),
    project: input.project === undefined && current ? current.project : str(input.project, 120) || '—',
    projectId: projectIdOf(input.projectId, current?.projectId),
    tags: tagsOf(input.tags, current?.tags),
    notes: notesOf(input.notes, current?.notes),
  }
}

export type WritableEntity = CollectionMap[WritableCollection]

export function buildEntity(
  collection: WritableCollection,
  input: Record<string, unknown>,
  now: string,
  current?: WritableEntity,
): WritableEntity {
  switch (collection) {
    case 'projects':
      return buildProject(input, now, current as Project | undefined)
    case 'clients':
      return buildClient(input, now, current as Client | undefined)
    case 'servers':
      return buildServer(input, now, current as Server | undefined)
    case 'domains':
      return buildDomain(input, now, current as Domain | undefined)
    case 'docs':
      return buildDoc(input, now, current as Doc | undefined)
    case 'campaigns':
      return buildCampaign(input, now, current as Campaign | undefined)
    case 'finance':
      return buildFinance(input, now, current as FinanceEntry | undefined)
    case 'secrets':
      return buildSecret(input, now, current as SecretRef | undefined)
    default:
      throw new ApiError(404, 'not_found', 'Неизвестная коллекция')
  }
}
