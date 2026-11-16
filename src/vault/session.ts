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
import {
  COLLECTIONS,
  DEFAULT_PREFS,
  type Collection,
  type CollectionMap,
  type VaultFs,
  type VaultMeta,
  type VaultPrefs,
} from './types'

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
    return `${collection}/${id}.json.enc`
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
    const next = { ...entity, updatedAt: new Date().toISOString() }
    await this.fs.mkdir(collection)
    await this.fs.writeBytes(this.entityPath(collection, entity.id), await encryptJson(key, next))
  }

  async remove(collection: Collection, id: string): Promise<void> {
    this.requireKey()
    await this.fs.remove(this.entityPath(collection, id))
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
