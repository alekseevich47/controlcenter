import type { VaultFs } from './types'
import { isTauri } from './runtime'

export { isTauri }

const te = new TextEncoder()
const td = new TextDecoder()

/** Native FS via Tauri plugins. Root is absolute vault path. */
export async function createTauriFs(vaultPath: string): Promise<VaultFs> {
  const { readFile, writeFile, exists, mkdir, readDir, remove } = await import(
    '@tauri-apps/plugin-fs'
  )
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { appDataDir, join } = await import('@tauri-apps/api/path')

  let root = vaultPath.replace(/[/\\]+$/, '')

  const resolve = async (path: string) => {
    const clean = path.replace(/^[/\\]+/, '')
    return join(root, clean)
  }

  const fs: VaultFs = {
    kind: 'tauri',
    async readBytes(path) {
      const p = await resolve(path)
      if (!(await exists(p))) return null
      return await readFile(p)
    },
    async writeBytes(path, data) {
      const p = await resolve(path)
      const parent = p.replace(/[/\\][^/\\]+$/, '')
      if (parent && !(await exists(parent))) {
        await mkdir(parent, { recursive: true })
      }
      await writeFile(p, data)
    },
    async readText(path) {
      const bytes = await this.readBytes(path)
      return bytes ? td.decode(bytes) : null
    },
    async writeText(path, text) {
      await this.writeBytes(path, te.encode(text))
    },
    async exists(path) {
      return exists(await resolve(path))
    },
    async mkdir(path) {
      await mkdir(await resolve(path), { recursive: true })
    },
    async list(path) {
      const p = await resolve(path)
      if (!(await exists(p))) return []
      const entries = await readDir(p)
      return entries.map((e) => e.name).filter(Boolean) as string[]
    },
    async remove(path) {
      await remove(await resolve(path), { recursive: true })
    },
    async pickDirectory() {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || Array.isArray(selected)) return null
      root = selected
      return selected
    },
    async getDefaultVaultPath() {
      const base = await appDataDir()
      return join(base, 'lcc-vault')
    },
  }

  return fs
}

export async function defaultTauriVaultPath(): Promise<string> {
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  return join(await appDataDir(), 'lcc-vault')
}
