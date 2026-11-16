import { createBrowserFs } from './browserFs'
import { createTauriFs, defaultTauriVaultPath, isTauri } from './tauriFs'
import type { VaultFs } from './types'

const PATH_KEY = 'lcc.vaultPath'

export function rememberVaultPath(path: string | null) {
  if (path) localStorage.setItem(PATH_KEY, path)
  else localStorage.removeItem(PATH_KEY)
}

export function recalledVaultPath(): string | null {
  return localStorage.getItem(PATH_KEY)
}

export async function createVaultFs(preferredPath?: string | null): Promise<{
  fs: VaultFs
  path: string
}> {
  if (isTauri()) {
    const path = preferredPath || recalledVaultPath() || (await defaultTauriVaultPath())
    const fs = await createTauriFs(path)
    rememberVaultPath(path)
    return { fs, path }
  }

  const path = preferredPath || recalledVaultPath() || 'browser-vault'
  rememberVaultPath(path)
  return { fs: createBrowserFs(path), path }
}
