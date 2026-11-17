/**
 * Токен Spaceweb живёт только в памяти процесса.
 * Пароль сюда не записывается: он остаётся в `.lcc/spaceweb.enc`.
 */

let cachedToken: string | null = null

function rejectedToken(token: string): boolean {
  if (token.length < 8 || token.length > 400 || token.includes('://') || /\s/.test(token)) return true
  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function setSpacewebToken(token: string | null): void {
  if (!token || rejectedToken(token)) {
    cachedToken = null
    return
  }
  cachedToken = token
}

export function getSpacewebToken(): string | null {
  return cachedToken
}

export function clearSpacewebToken(): void {
  cachedToken = null
}
