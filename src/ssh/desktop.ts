import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../vault/runtime'

export type SshMaterialAuth = {
  host: string
  port: number
  user: string
  auth: 'key' | 'password'
  material: string
  fingerprint: string
}

export type MetricReading = {
  cpu: number
  ram: number
  disk: number
  rx_bytes: number
  tx_bytes: number
  uptime_sec: number
}

export type RemoteFile = { name: string; dir: boolean; size: number }
export type RemoteService = { unit: string; active: string }

export function sshAvailable(): boolean {
  return isTauri()
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Консоль и файлы хоста доступны в приложении для компьютера')
  return invoke<T>(command, args)
}

export function sshProbe(auth: SshMaterialAuth): Promise<{ fingerprint: string; accepted: boolean }> {
  return call('ssh_probe', { auth })
}

export function sshMetrics(auth: SshMaterialAuth): Promise<MetricReading> {
  return call('ssh_metrics', { auth })
}

export function sshServices(auth: SshMaterialAuth): Promise<RemoteService[]> {
  return call('ssh_services', { auth })
}

export function sshJournal(auth: SshMaterialAuth): Promise<string[]> {
  return call('ssh_journal', { auth })
}

export function sshListDir(auth: SshMaterialAuth, path: string): Promise<RemoteFile[]> {
  return call('ssh_list_dir', { auth, path })
}

export function sshReadFile(auth: SshMaterialAuth, path: string): Promise<string> {
  return call('ssh_read_file', { auth, path })
}

export function sshWriteFile(auth: SshMaterialAuth, path: string, bytesB64: string): Promise<void> {
  return call('ssh_write_file', { auth, path, bytesB64 })
}

export function sshMkdir(auth: SshMaterialAuth, path: string): Promise<void> {
  return call('ssh_mkdir', { auth, path })
}

export function sshRemove(auth: SshMaterialAuth, path: string, dir: boolean): Promise<void> {
  return call('ssh_remove', { auth, path, dir })
}

export function sshPtyOpen(auth: SshMaterialAuth, cols: number, rows: number): Promise<string> {
  return call('ssh_pty_open', { open: { auth, cols, rows } })
}

export function sshPtyWrite(id: string, bytesB64: string): Promise<void> {
  return call('ssh_pty_write', { id, bytesB64 })
}

export function sshPtyResize(id: string, cols: number, rows: number): Promise<void> {
  return call('ssh_pty_resize', { id, cols, rows })
}

export function sshPtyClose(id: string): Promise<void> {
  return call('ssh_pty_close', { id })
}

export function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function decodeBytes(raw: string): Uint8Array {
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4))
  const binary = atob(raw + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}
