import {
  createVaultMeta,
  decryptJson,
  deriveKey,
  encryptJson,
  openProbe,
  sealProbe,
} from './crypto'
import {
  seedCampaigns,
  seedClients,
  seedDocs,
  seedDomains,
  seedEvents,
  seedFinance,
  seedProjects,
  seedSecrets,
  seedServers,
} from './seed'
import { normalizeVaultPrefs } from './historyPrefs'
import { generateApiToken } from '../api/token'
import { assertSafeEntityId } from './ids'
import {
  COLLECTIONS,
  DEFAULT_PREFS,
  type Collection,
  type CollectionMap,
  type VaultFs,
  type VaultMeta,
  type VaultPrefs,
} from './types'

const GITHUB_PATH = '.lcc/github.enc'
const SPACEWEB_PATH = '.lcc/spaceweb.enc'
const API_TOKEN_PATH = '.lcc/api-token.enc'

export type GithubAuthRecord = {
  token: string
  login: string
  updatedAt: string
}

export type SpacewebAuthRecord = {
  login: string
  password: string
  updatedAt: string
}

export type ApiTokenRecord = {
  token: string
  createdAt: string
}

const META_PATH = '.lcc/meta.json'
const PROBE_PATH = '.lcc/probe.enc'
const PREFS_PATH = '.lcc/prefs.json'

export class VaultSession {
  private key: CryptoKey | null = null
  private meta: VaultMeta | null = null
  prefs: VaultPrefs = { ...DEFAULT_PREFS }
  fs: VaultFs

  constructor(fs: VaultFs) {
    this.fs = fs
  }

  get unlocked() {
    return this.key != null
  }

  async hasVault(): Promise<boolean> {
    return this.fs.exists(META_PATH)
  }

  async loadPrefs(): Promise<VaultPrefs> {
    const raw = await this.fs.readText(PREFS_PATH)
    if (!raw) {
      this.prefs = normalizeVaultPrefs(DEFAULT_PREFS)
      return this.prefs
    }
    try {
      this.prefs = normalizeVaultPrefs(JSON.parse(raw) as Partial<VaultPrefs>)
    } catch {
      this.prefs = normalizeVaultPrefs(DEFAULT_PREFS)
    }
    return this.prefs
  }

  async savePrefs(patch: Partial<VaultPrefs>): Promise<VaultPrefs> {
    const nextHistory =
      patch.history !== undefined
        ? normalizeVaultPrefs({ ...this.prefs, ...patch }).history
        : this.prefs.history
    this.prefs = normalizeVaultPrefs({ ...this.prefs, ...patch, history: nextHistory })
    await this.fs.mkdir('.lcc')
    await this.fs.writeText(PREFS_PATH, JSON.stringify(this.prefs, null, 2))
    return this.prefs
  }

  async create(password: string): Promise<void> {
    if (await this.hasVault()) throw new Error('Vault уже существует')
    if (password.length < 6) throw new Error('Пароль слишком короткий (мин. 6)')

    this.meta = await createVaultMeta()
    this.key = await deriveKey(password, this.meta)

    await this.fs.mkdir('.lcc')
    for (const c of COLLECTIONS) await this.fs.mkdir(c)

    await this.fs.writeText(META_PATH, JSON.stringify(this.meta, null, 2))
    await this.fs.writeBytes(PROBE_PATH, await sealProbe(this.key))
    await this.savePrefs({ ...DEFAULT_PREFS, encrypt: true })
    await this.seedAll()
  }

  async unlock(password: string): Promise<void> {
    const raw = await this.fs.readText(META_PATH)
    if (!raw) throw new Error('Vault не найден — создайте новый')
    this.meta = JSON.parse(raw) as VaultMeta
    this.key = await deriveKey(password, this.meta)
    const probe = await this.fs.readBytes(PROBE_PATH)
    if (!probe || !(await openProbe(this.key, probe))) {
      this.key = null
      throw new Error('Неверный мастер-пароль')
    }
    await this.loadPrefs()
  }

  lock(): void {
    this.key = null
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error('Vault заблокирован')
    return this.key
  }

  private entityPath(collection: Collection, id: string) {
    return `${collection}/${assertSafeEntityId(id)}.json.enc`
  }

  private async readEnc<T>(path: string): Promise<T | null> {
    const blob = await this.fs.readBytes(path)
    if (!blob) return null
    try {
      return await decryptJson<T>(this.requireKey(), blob)
    } catch {
      return null
    }
  }

  private async writeEnc(path: string, value: unknown): Promise<void> {
    const key = this.requireKey()
    await this.fs.mkdir('.lcc')
    await this.fs.writeBytes(path, await encryptJson(key, value))
  }

  async readGithubAuth(): Promise<GithubAuthRecord | null> {
    const row = await this.readEnc<GithubAuthRecord>(GITHUB_PATH)
    if (!row || typeof row.token !== 'string' || typeof row.login !== 'string') return null
    return { token: row.token, login: row.login, updatedAt: row.updatedAt ?? '' }
  }

  async writeGithubAuth(auth: GithubAuthRecord): Promise<void> {
    await this.writeEnc(GITHUB_PATH, {
      token: auth.token,
      login: auth.login,
      updatedAt: auth.updatedAt,
    })
  }

  async clearGithubAuth(): Promise<void> {
    this.requireKey()
    if (await this.fs.exists(GITHUB_PATH)) await this.fs.remove(GITHUB_PATH)
  }

  async readSpacewebAuth(): Promise<SpacewebAuthRecord | null> {
    const row = await this.readEnc<SpacewebAuthRecord>(SPACEWEB_PATH)
    if (!row || typeof row.login !== 'string' || typeof row.password !== 'string') return null
    if (!row.login.trim() || !row.password) return null
    return { login: row.login, password: row.password, updatedAt: row.updatedAt ?? '' }
  }

  async writeSpacewebAuth(auth: SpacewebAuthRecord): Promise<void> {
    await this.writeEnc(SPACEWEB_PATH, {
      login: auth.login,
      password: auth.password,
      updatedAt: auth.updatedAt,
    })
  }

  async clearSpacewebAuth(): Promise<void> {
    this.requireKey()
    if (await this.fs.exists(SPACEWEB_PATH)) await this.fs.remove(SPACEWEB_PATH)
  }

  async readApiToken(): Promise<ApiTokenRecord | null> {
    const row = await this.readEnc<ApiTokenRecord>(API_TOKEN_PATH)
    if (!row || typeof row.token !== 'string' || !row.token.startsWith('lcc_')) return null
    return { token: row.token, createdAt: row.createdAt ?? '' }
  }

  async ensureApiToken(): Promise<ApiTokenRecord> {
    const existing = await this.readApiToken()
    if (existing) return existing
    const created: ApiTokenRecord = {
      token: generateApiToken(),
      createdAt: new Date().toISOString(),
    }
    await this.writeEnc(API_TOKEN_PATH, created)
    return created
  }

  async rotateApiToken(): Promise<ApiTokenRecord> {
    const created: ApiTokenRecord = {
      token: generateApiToken(),
      createdAt: new Date().toISOString(),
    }
    await this.writeEnc(API_TOKEN_PATH, created)
    return created
  }

  async list<C extends Collection>(collection: C): Promise<CollectionMap[C][]> {
    const key = this.requireKey()
    const names = await this.fs.list(collection)
    const out: CollectionMap[C][] = []
    for (const name of names) {
      if (!name.endsWith('.json.enc')) continue
      const blob = await this.fs.readBytes(`${collection}/${name}`)
      if (!blob) continue
      out.push(await decryptJson<CollectionMap[C]>(key, blob))
    }
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return out
  }

  async get<C extends Collection>(collection: C, id: string): Promise<CollectionMap[C] | null> {
    const blob = await this.fs.readBytes(this.entityPath(collection, id))
    if (!blob) return null
    return decryptJson<CollectionMap[C]>(this.requireKey(), blob)
  }

  async put<C extends Collection>(collection: C, entity: CollectionMap[C]): Promise<void> {
    const key = this.requireKey()
    const id = assertSafeEntityId(entity.id)
    const next = { ...entity, id, updatedAt: new Date().toISOString() }
    await this.fs.mkdir(collection)
    await this.fs.writeBytes(this.entityPath(collection, id), await encryptJson(key, next))
  }

  async remove(collection: Collection, id: string): Promise<void> {
    this.requireKey()
    await this.fs.remove(this.entityPath(collection, id))
  }

  async readBackupPassword(id: string): Promise<string | null> {
    const safe = assertSafeEntityId(id)
    const row = await this.readEnc<{ password?: string }>(`.lcc/backup/${safe}.enc`)
    if (!row || typeof row.password !== 'string' || row.password.length < 12) return null
    return row.password
  }

  async writeBackupPassword(id: string, password: string): Promise<void> {
    const safe = assertSafeEntityId(id)
    if (password.length < 12 || password.length > 128 || /[\r\n]/.test(password)) {
      throw new Error('Пароль репозитория не подходит')
    }
    await this.fs.mkdir('.lcc/backup')
    await this.writeEnc(`.lcc/backup/${safe}.enc`, { password, updatedAt: new Date().toISOString() })
  }

  async readSshMaterial(id: string): Promise<{ auth: 'key' | 'password'; material: string } | null> {
    const safe = assertSafeEntityId(id)
    const row = await this.readEnc<{ auth?: string; material?: string }>(`.lcc/ssh/${safe}.enc`)
    if (!row || (row.auth !== 'key' && row.auth !== 'password')) return null
    if (typeof row.material !== 'string' || !row.material.trim()) return null
    return { auth: row.auth, material: row.material }
  }

  async writeSshMaterial(id: string, auth: 'key' | 'password', material: string): Promise<void> {
    const safe = assertSafeEntityId(id)
    const body = material.replace(/\r\n/g, '\n')
    if (!body.trim() || body.length > 32_000) throw new Error('Ключ или пароль пустой или слишком длинный')
    await this.fs.mkdir('.lcc/ssh')
    await this.writeEnc(`.lcc/ssh/${safe}.enc`, { auth, material: body, updatedAt: new Date().toISOString() })
  }

  async removeSshMaterial(id: string): Promise<void> {
    const safe = assertSafeEntityId(id)
    const path = `.lcc/ssh/${safe}.enc`
    if (await this.fs.exists(path)) await this.fs.remove(path)
  }

  async readMetricSamples(id: string): Promise<{ t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }[]> {
    const safe = assertSafeEntityId(id)
    const row = await this.readEnc<{ samples?: unknown }>(`.lcc/metrics/${safe}.json.enc`)
    if (!row || !Array.isArray(row.samples)) return []
    return row.samples.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const sample = item as Record<string, unknown>
      const t = sample.t
      const cpu = sample.cpu
      const ram = sample.ram
      const disk = sample.disk
      const rx = sample.rx
      const tx = sample.tx
      if (typeof t !== 'number' || typeof cpu !== 'number' || typeof ram !== 'number' || typeof disk !== 'number') {
        return []
      }
      if (typeof rx !== 'number' || typeof tx !== 'number') return []
      return [{ t, cpu, ram, disk, rx, tx }]
    })
  }

  async writeMetricSamples(
    id: string,
    samples: { t: number; cpu: number; ram: number; disk: number; rx: number; tx: number }[],
  ): Promise<void> {
    const safe = assertSafeEntityId(id)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const kept = samples.filter((sample) => sample.t >= cutoff).slice(-20_160)
    await this.fs.mkdir('.lcc/metrics')
    await this.writeEnc(`.lcc/metrics/${safe}.json.enc`, { samples: kept })
  }

  /** Export encrypted snapshot marker for future cloud sync. */
  async markSynced(): Promise<void> {
    await this.savePrefs({ lastSyncAt: new Date().toISOString() })
  }

  private async seedAll() {
    await Promise.all([
      ...seedProjects().map((e) => this.put('projects', e)),
      ...seedClients().map((e) => this.put('clients', e)),
      ...seedServers().map((e) => this.put('servers', e)),
      ...seedDomains().map((e) => this.put('domains', e)),
      ...seedDocs().map((e) => this.put('docs', e)),
      ...seedCampaigns().map((e) => this.put('campaigns', e)),
      ...seedFinance().map((e) => this.put('finance', e)),
      ...seedSecrets().map((e) => this.put('secrets', e)),
      ...seedEvents().map((e) => this.put('events', e)),
    ])
  }
}
