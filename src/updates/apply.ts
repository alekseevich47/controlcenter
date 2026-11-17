import { startReleaseInstall } from './releaseDownload'

export async function applyAppUpdate(): Promise<{ ok: boolean; message: string; version?: string }> {
  return startReleaseInstall()
}
