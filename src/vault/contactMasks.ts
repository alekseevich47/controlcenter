/** Маски ввода для контактов клиента. */

const PHONE_DIGITS = 10 // после кода страны 7

/** Оставить только цифры; ведущая 8/7 страны нормализуется. */
export function extractRuPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.startsWith('7')) digits = digits.slice(1)
  return digits.slice(0, PHONE_DIGITS)
}

/** Формат: +7-900-000-1111 */
export function formatRuPhone(raw: string): string {
  const d = extractRuPhoneDigits(raw)
  if (!d) return '+7-'
  const p1 = d.slice(0, 3)
  const p2 = d.slice(3, 6)
  const p3 = d.slice(6, 10)
  let out = `+7-${p1}`
  if (p2) out += `-${p2}`
  if (p3) out += `-${p3}`
  return out
}

/** Полный номер (+7-XXX-XXX-XXXX) или пусто, если цифр нет. */
export function sanitizeRuPhone(raw: string): string {
  const d = extractRuPhoneDigits(raw)
  if (!d) return ''
  return formatRuPhone(d)
}

export function isCompleteRuPhone(raw: string): boolean {
  return extractRuPhoneDigits(raw).length === PHONE_DIGITS
}

/** Telegram: один ведущий @, без дублей. */
export function formatTelegramAccount(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '@'
  const withoutAt = trimmed.replace(/^@+/, '')
  return `@${withoutAt}`
}

export function sanitizeTelegramAccount(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, '')
  if (!trimmed) return ''
  return `@${trimmed.slice(0, 190)}`
}

const VK_PREFIX = 'vk.ru/'

/** VK: префикс vk.ru/ без дублей. */
export function formatVkAccount(raw: string): string {
  let s = raw.trim()
  if (!s) return VK_PREFIX
  s = s.replace(/^https?:\/\//i, '')
  s = s.replace(/^(www\.)?vk\.(com|ru)\//i, '')
  s = s.replace(/^vk\.ru\//i, '')
  return `${VK_PREFIX}${s}`
}

export function sanitizeVkAccount(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\//i, '')
  s = s.replace(/^(www\.)?vk\.(com|ru)\//i, '')
  s = s.replace(/^vk\.ru\//i, '')
  s = s.trim()
  if (!s) return ''
  return `${VK_PREFIX}${s.slice(0, 180)}`
}

export function sanitizeEmail(raw: string): string {
  return raw.trim().slice(0, 200)
}
