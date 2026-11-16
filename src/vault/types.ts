export type Collection =
  | 'projects'
  | 'clients'
  | 'servers'
  | 'domains'
  | 'docs'
  | 'campaigns'
  | 'finance'
  | 'secrets'
  | 'events'

/** Коллекции с CRUD-аудитом (сама `events` не логируется). */
export type AuditableCollection = Exclude<Collection, 'events'>

export const COLLECTIONS: Collection[] = [
  'projects',
  'clients',
  'servers',
  'domains',
  'docs',
  'campaigns',
  'finance',
  'secrets',
  'events',
]

export const AUDITABLE_COLLECTIONS: AuditableCollection[] = [
  'projects',
  'clients',
  'servers',
  'domains',
  'docs',
  'campaigns',
  'finance',
  'secrets',
]

export interface VaultMeta {
  version: 1
  kdf: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  saltB64: string
  createdAt: string
}

export type CrudCaptureFlags = {
  create: boolean
  update: boolean
  delete: boolean
}

export type HistoryEventFlag =
  | 'vaultLock'
  | 'vaultUnlock'
  | 'vaultSync'
  | 'prefsChange'
  | 'historyPurge'
  | 'vaultFolderChange'
  | 'projectArchive'
  | 'projectUnarchive'
  | 'projectPin'
  | 'projectStatusChange'
  | 'serverStatusChange'

export type HistoryCapturePrefs = {
  entities: Record<AuditableCollection, CrudCaptureFlags>
  events: Record<HistoryEventFlag, boolean>
}

export type HistoryPrefs = {
  capture: HistoryCapturePrefs
}

export interface VaultPrefs {
  syncOnExit: boolean
  encrypt: boolean
  aiFiles: boolean
  profileName: string
  role: 'owner' | 'partner'
  lastSyncAt: string | null
  vaultPath: string | null
  /**
   * Локальный HTTP API на 127.0.0.1.
   * Bearer лежит в зашифрованном `.lcc/api-token.enc`, не в prefs.
   */
  localApi: boolean
  /** Журнал: что писать в events и политики очистки */
  history: HistoryPrefs
}

export interface EntityBase {
  id: string
  updatedAt: string
  createdAt: string
  tags?: string[]
  notes?: string
  projectId?: string
}

export type ProjectStatusKind = 'green' | 'blue' | 'amber' | 'purple' | 'red'

/** Привязка проекта к репозиторию GitHub. Токен здесь не хранится. */
export interface GithubRepoLink {
  owner: string
  repo: string
}

export interface Project extends EntityBase {
  name: string
  status: string
  statusKind: ProjectStatusKind
  stack: string
  /** Отображаемое имя клиента (денормализация) */
  client: string
  /** Привязка к Client.id */
  clientId?: string | null
  domain: string
  note: string
  /** Закреплённые проекты сортируются выше остальных */
  pinned?: boolean
  /** Soft-archive: проект в разделе «Архив» */
  deletedAt?: string | null
  /** Репозиторий GitHub (`owner/repo`). Токен — отдельно, в `.lcc/github.enc`. */
  github?: GithubRepoLink | null
}

/** Каналы связи клиента (несколько позиций на канал). */
export type ClientContactChannel =
  | 'phone'
  | 'telegram'
  | 'max'
  | 'vk'
  | 'whatsapp'
  | 'email'

export interface ClientContactItem {
  id: string
  /**
   * Основное значение канала:
   * phone/max/whatsapp → телефон; telegram/vk → аккаунт; email → почта.
   */
  value: string
  /** Доп. телефон (сейчас: Telegram) */
  phone?: string
  /** Опциональная подпись («Рабочий», «Личный»…) */
  label?: string
}

export type ClientContacts = Record<ClientContactChannel, ClientContactItem[]>

export interface Client extends EntityBase {
  name: string
  /** Структурированные контакты по каналам */
  contacts: ClientContacts
  note: string
  /** Id привязанных проектов */
  projectIds?: string[]
  /**
   * @deprecated текстовая сводка; предпочтительно projectIds + имена из projects
   */
  projects?: string
  /** @deprecated legacy seed/vault — мигрируется в contacts */
  contact?: string
  /** @deprecated legacy seed/vault — мигрируется в contacts */
  channels?: string
}

export type ServerStatusKind = 'green' | 'amber' | 'red'

export interface Server extends EntityBase {
  name: string
  host: string
  specs: string
  role: string
  status: string
  statusKind: ServerStatusKind
}

export interface Domain extends EntityBase {
  domain: string
  registrar: string
  dns: string
  expires: string
  ssl: string
  project: string
}

export interface Doc extends EntityBase {
  title: string
  type: string
  project: string
  body?: string
}

export interface Campaign extends EntityBase {
  name: string
  platform: string
  project: string
  budget: string
  status: string
  statusKind: 'green' | 'amber'
  /** seo — органика, ads — платная реклама. Пусто = видно в обеих вкладках проекта. */
  channel?: 'seo' | 'ads'
}

export interface FinanceEntry extends EntityBase {
  title: string
  category: string
  project: string
  amount: number
  date: string
}

export interface SecretRef extends EntityBase {
  name: string
  place: string
  project: string
}

/** Журнал изменений vault (+ legacy-заметки дашборда). */
export interface VaultEvent extends EntityBase {
  title: string
  when: string
  /** create | update | delete | note — у seed-записей может отсутствовать */
  action?: 'create' | 'update' | 'delete' | 'note'
  collection?: Collection
  entityId?: string
  entityLabel?: string
  actor?: string
  actorRole?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  changedKeys?: string[]
}

export type CollectionMap = {
  projects: Project
  clients: Client
  servers: Server
  domains: Domain
  docs: Doc
  campaigns: Campaign
  finance: FinanceEntry
  secrets: SecretRef
  events: VaultEvent
}

export interface VaultFs {
  kind: 'browser' | 'tauri'
  readBytes(path: string): Promise<Uint8Array | null>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  readText(path: string): Promise<string | null>
  writeText(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  list(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  pickDirectory?(): Promise<string | null>
  getDefaultVaultPath?(): Promise<string>
}

const ALL_CRUD_ON: CrudCaptureFlags = { create: true, update: true, delete: true }

function defaultHistoryPrefs(): HistoryPrefs {
  return {
    capture: {
      entities: {
        projects: { ...ALL_CRUD_ON },
        clients: { ...ALL_CRUD_ON },
        servers: { ...ALL_CRUD_ON },
        domains: { ...ALL_CRUD_ON },
        docs: { ...ALL_CRUD_ON },
        campaigns: { ...ALL_CRUD_ON },
        finance: { ...ALL_CRUD_ON },
        secrets: { ...ALL_CRUD_ON },
      },
      events: {
        vaultLock: true,
        vaultUnlock: true,
        vaultSync: true,
        prefsChange: true,
        historyPurge: true,
        vaultFolderChange: true,
        projectArchive: true,
        projectUnarchive: true,
        projectPin: true,
        projectStatusChange: true,
        serverStatusChange: true,
      },
    },
  }
}

export const DEFAULT_PREFS: VaultPrefs = {
  syncOnExit: true,
  encrypt: true,
  aiFiles: true,
  profileName: 'Nikolay',
  role: 'owner',
  lastSyncAt: null,
  vaultPath: null,
  localApi: false,
  history: defaultHistoryPrefs(),
}

export const KDF_ITERATIONS = 310_000
