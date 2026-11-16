import type { VaultFs } from './types'

const DB_NAME = 'lcc-vault-fs'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(path: string): Promise<Uint8Array | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(path)
    req.onsuccess = () => {
      const v = req.result
      if (!v) resolve(null)
      else resolve(v instanceof Uint8Array ? v : new Uint8Array(v))
    }
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(path: string, data: Uint8Array): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbKeys(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String))
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(path: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const td = new TextDecoder()
const te = new TextEncoder()

/** Dev/browser backend: paths are virtual keys in IndexedDB. */
export function createBrowserFs(rootLabel = 'browser-vault'): VaultFs {
  const root = rootLabel.replace(/\\/g, '/').replace(/\/+$/, '')

  const full = (path: string) => {
    const p = path.replace(/\\/g, '/').replace(/^\/+/, '')
    return `${root}/${p}`
  }

  return {
    kind: 'browser',
    async readBytes(path) {
      return idbGet(full(path))
    },
    async writeBytes(path, data) {
      await idbSet(full(path), data)
      const dirMarker = full(path).split('/').slice(0, -1).join('/')
      if (dirMarker) await idbSet(`${dirMarker}/.dir`, te.encode('1'))
    },
    async readText(path) {
      const bytes = await idbGet(full(path))
      return bytes ? td.decode(bytes) : null
    },
    async writeText(path, text) {
      await this.writeBytes(path, te.encode(text))
    },
    async exists(path) {
      return (await idbGet(full(path))) != null
    },
    async mkdir(path) {
      await idbSet(`${full(path)}/.dir`, te.encode('1'))
    },
    async list(path) {
      const prefix = `${full(path)}/`
      const keys = await idbKeys()
      const names = new Set<string>()
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        if (!rest || rest === '.dir') continue
        const name = rest.split('/')[0]
        if (name && name !== '.dir') names.add(name)
      }
      return [...names]
    },
    async remove(path) {
      const target = full(path)
      const keys = await idbKeys()
      for (const key of keys) {
        if (key === target || key.startsWith(`${target}/`)) await idbDelete(key)
      }
    },
    async pickDirectory() {
      return root
    },
    async getDefaultVaultPath() {
      return root
    },
  }
}
