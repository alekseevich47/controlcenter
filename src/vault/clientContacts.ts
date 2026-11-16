import {
  sanitizeEmail,
  sanitizeRuPhone,
  sanitizeTelegramAccount,
  sanitizeVkAccount,
} from './contactMasks'
import type {
  Client,
  ClientContactChannel,
  ClientContactItem,
  ClientContacts,
} from './types'

export const CLIENT_CONTACT_CHANNELS: ClientContactChannel[] = [
  'phone',
  'telegram',
  'max',
  'vk',
  'whatsapp',
  'email',
]

export const CLIENT_CONTACT_LABELS: Record<ClientContactChannel, string> = {
  phone: 'Телефон',
  telegram: 'Telegram',
  max: 'MAX',
  vk: 'VK',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
}

/** Подпись основного поля в модалке контакта. */
export const CLIENT_VALUE_FIELD_LABELS: Record<ClientContactChannel, string> = {
  phone: 'Телефон',
  telegram: 'Аккаунт',
  max: 'Телефон',
  vk: 'Аккаунт',
  whatsapp: 'Телефон',
  email: 'Почта',
}

export const CLIENT_CONTACT_PLACEHOLDERS: Record<ClientContactChannel, string> = {
  phone: '+7-900-000-1111',
  telegram: '@username',
  max: '+7-900-000-1111',
  vk: 'vk.ru/id',
  whatsapp: '+7-900-000-1111',
  email: 'name@example.com',
}

export const CONTACT_LABEL_PRESETS = ['Рабочий', 'Личный'] as const

/** Каналы, где основное value — телефон. */
export const PHONE_VALUE_CHANNELS: ClientContactChannel[] = ['phone', 'max', 'whatsapp']

const MAX = {
  value: 200,
  label: 60,
  itemsPerChannel: 20,
  name: 120,
  note: 2000,
  projects: 400,
  projectIds: 64,
} as const

export { MAX as CLIENT_FIELD_MAX }

export function emptyContacts(): ClientContacts {
  return {
    phone: [],
    telegram: [],
    max: [],
    vk: [],
    whatsapp: [],
    email: [],
  }
}

function isChannel(raw: string): raw is ClientContactChannel {
  return (CLIENT_CONTACT_CHANNELS as string[]).includes(raw)
}

function sanitizeItem(raw: unknown): ClientContactItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id =
    typeof row.id === 'string' && row.id.trim() && !/[/\\]/.test(row.id)
      ? row.id.trim().slice(0, 64)
      : `cc-${crypto.randomUUID().slice(0, 8)}`
  const value = typeof row.value === 'string' ? row.value.trim().slice(0, MAX.value) : ''
  const phoneRaw = typeof row.phone === 'string' ? sanitizeRuPhone(row.phone) : ''
  const label =
    typeof row.label === 'string' && row.label.trim()
      ? row.label.trim().slice(0, MAX.label)
      : undefined

  // Telegram: value и/или phone
  if (!value && !phoneRaw) return null

  const item: ClientContactItem = { id, value }
  if (phoneRaw) item.phone = phoneRaw
  if (label) item.label = label
  return item
}

function sanitizeContacts(raw: unknown): ClientContacts {
  const out = emptyContacts()
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const ch of CLIENT_CONTACT_CHANNELS) {
    const list = src[ch]
    if (!Array.isArray(list)) continue
    const items: ClientContactItem[] = []
    for (const entry of list) {
      if (items.length >= MAX.itemsPerChannel) break
      const item = sanitizeItem(entry)
      if (item) items.push(item)
    }
    out[ch] = items
  }
  return out
}

function migrateLegacyContacts(client: Client): ClientContacts {
  const base = emptyContacts()
  const contact = typeof client.contact === 'string' ? client.contact.trim() : ''

  if (contact && contact !== '—') {
    const id = `cc-${crypto.randomUUID().slice(0, 8)}`
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      base.email.push({ id, value: contact })
    } else if (/^[\d+\s()-]{6,}$/.test(contact)) {
      const phone = sanitizeRuPhone(contact)
      if (phone) base.phone.push({ id, value: phone })
    } else if (contact.startsWith('@') || /t\.me\//i.test(contact)) {
      base.telegram.push({ id, value: sanitizeTelegramAccount(contact) })
    }
  }

  return base
}

function sanitizeProjectIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (out.length >= MAX.projectIds) break
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (!id || id.length > 128 || /[/\\]/.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out.length > 0 ? out : undefined
}

/**
 * Нормализация Client из vault (legacy → contacts / projectIds).
 * Идемпотентна; не пишет на диск сама.
 */
export function normalizeClient(raw: Client): Client {
  const hasContacts =
    raw.contacts &&
    typeof raw.contacts === 'object' &&
    CLIENT_CONTACT_CHANNELS.some((ch) => Array.isArray(raw.contacts?.[ch]))

  const contacts = hasContacts
    ? sanitizeContacts(raw.contacts)
    : migrateLegacyContacts(raw)

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, MAX.name)
      : 'Без имени'
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX.note) : ''
  const projectIds = sanitizeProjectIds(raw.projectIds)
  const projects =
    typeof raw.projects === 'string' && raw.projects.trim()
      ? raw.projects.trim().slice(0, MAX.projects)
      : undefined

  return {
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    name,
    note,
    contacts,
    tags: raw.tags,
    notes: raw.notes,
    projectId: raw.projectId,
    ...(projectIds ? { projectIds } : {}),
    ...(projects ? { projects } : {}),
  }
}

export function countContacts(contacts: ClientContacts): number {
  let n = 0
  for (const ch of CLIENT_CONTACT_CHANNELS) n += contacts[ch].length
  return n
}

export function contactsSummary(contacts: ClientContacts): string {
  const labels: string[] = []
  for (const ch of CLIENT_CONTACT_CHANNELS) {
    if (contacts[ch].length > 0) labels.push(CLIENT_CONTACT_LABELS[ch])
  }
  return labels.join(' · ') || '—'
}

export function primaryContactLine(client: Client): string {
  const c = normalizeClient(client)
  for (const ch of CLIENT_CONTACT_CHANNELS) {
    const first = c.contacts[ch][0]
    if (first) {
      const label = first.label ? `${first.label}: ` : ''
      const main = first.value || first.phone || ''
      if (!main) continue
      return `${CLIENT_CONTACT_LABELS[ch]} · ${label}${main}`
    }
  }
  if (typeof client.contact === 'string' && client.contact.trim() && client.contact !== '—') {
    return client.contact.trim()
  }
  return '—'
}

export function haystackContacts(contacts: ClientContacts): string {
  const parts: string[] = []
  for (const ch of CLIENT_CONTACT_CHANNELS) {
    for (const item of contacts[ch]) {
      if (item.value) parts.push(item.value)
      if (item.phone) parts.push(item.phone)
      if (item.label) parts.push(item.label)
      parts.push(CLIENT_CONTACT_LABELS[ch])
    }
  }
  return parts.join(' ')
}

export function newContactId(): string {
  return `cc-${crypto.randomUUID().slice(0, 8)}`
}

/** Уникальные телефоны клиента (для выбора в других каналах). */
export function collectClientPhones(contacts: ClientContacts): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string | undefined) => {
    const phone = raw ? sanitizeRuPhone(raw) : ''
    if (!phone || seen.has(phone)) return
    seen.add(phone)
    out.push(phone)
  }
  for (const ch of PHONE_VALUE_CHANNELS) {
    for (const item of contacts[ch]) push(item.value)
  }
  for (const item of contacts.telegram) push(item.phone)
  return out
}

export type ContactInputResult =
  | { value: string; phone?: string; label?: string }
  | { error: string }

export function sanitizeContactInput(
  channel: ClientContactChannel,
  value: string,
  label?: string,
  phone?: string,
): ContactInputResult {
  if (!isChannel(channel)) return { error: 'Неизвестный канал' }

  const l = label?.trim().slice(0, MAX.label)
  let nextValue = ''
  let nextPhone: string | undefined

  if (PHONE_VALUE_CHANNELS.includes(channel)) {
    nextValue = sanitizeRuPhone(value)
    if (!nextValue) return { error: 'Укажите телефон' }
  } else if (channel === 'telegram') {
    nextValue = sanitizeTelegramAccount(value)
    nextPhone = sanitizeRuPhone(phone ?? '') || undefined
    if (!nextValue && !nextPhone) {
      return { error: 'Укажите аккаунт или телефон' }
    }
  } else if (channel === 'vk') {
    nextValue = sanitizeVkAccount(value)
    if (!nextValue) return { error: 'Укажите аккаунт' }
  } else if (channel === 'email') {
    nextValue = sanitizeEmail(value)
    if (!nextValue) return { error: 'Укажите почту' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextValue)) {
      return { error: 'Некорректный E-mail' }
    }
  } else {
    nextValue = value.trim().slice(0, MAX.value)
    if (!nextValue) return { error: 'Укажите значение' }
  }

  const result: { value: string; phone?: string; label?: string } = { value: nextValue }
  if (nextPhone) result.phone = nextPhone
  if (l) result.label = l
  return result
}

/** Копирование в буфер с безопасным fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.trim()
  if (!value) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
