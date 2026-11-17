import type { Server } from '../vault/types'

const HOST = /^(?:[A-Za-z0-9.-]{1,253}|\d{1,3}(?:\.\d{1,3}){3})$/

/** Куда стучаться: IP из снимка хостера или поле «Хост», если это адрес без пробелов. */
export function sshHost(server: Server): string | null {
  const ip = server.hostSnapshot?.ip?.trim() ?? ''
  if (ip && HOST.test(ip) && !ip.includes('..')) return ip
  const host = server.host.trim()
  if (host && HOST.test(host) && !host.includes('..') && host !== '—') return host
  return null
}

export function sshSecretId(serverId: string): string {
  return serverId
}
