import type { ServerStatusKind } from './types'

export const SERVER_STATUSES = ['Online', 'Reserve', 'Offline'] as const

export type ServerStatus = (typeof SERVER_STATUSES)[number]

export function normalizeServerStatus(raw: string): ServerStatus {
  const s = raw.trim().toLowerCase()
  if (s === 'offline' || s === 'off' || s === 'выкл' || s === 'stopped') return 'Offline'
  if (s === 'reserve' || s === 'резерв' || s === 'standby') return 'Reserve'
  if (s === 'online' || s === 'on' || s === 'вкл' || s === 'running') return 'Online'
  return 'Online'
}

export function serverStatusKind(status: string): ServerStatusKind {
  const normalized = normalizeServerStatus(status)
  if (normalized === 'Offline') return 'red'
  if (normalized === 'Reserve') return 'amber'
  return 'green'
}

export function isServerRunning(status: string, statusKind?: ServerStatusKind): boolean {
  if (statusKind === 'red') return false
  return normalizeServerStatus(status) !== 'Offline'
}
