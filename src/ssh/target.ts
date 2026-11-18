import type { Server } from '../vault/types'

const HOST = /^(?:[A-Za-z0-9.-]{1,253}|\d{1,3}(?:\.\d{1,3}){3})$/
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
/** Сайт панели, не адрес машины. Без снимка IP туда стучаться нельзя. */
const PANEL = /^(?:www\.)?(?:sweb\.ru|timeweb\.cloud|timeweb\.ru)$/i

function usable(value: string): boolean {
  return HOST.test(value) && !value.includes('..')
}

/** Куда стучаться: IP из снимка хостера, иначе поле «Хост», если это адрес машины. */
export function sshHost(server: Server): string | null {
  const ip = server.hostSnapshot?.ip?.trim() ?? ''
  if (usable(ip)) return ip
  const host = server.host.trim()
  if (!usable(host) || host === '—') return null
  if (!IPV4.test(host) && PANEL.test(host)) return null
  return host
}

export function sshSecretId(serverId: string): string {
  return serverId
}
