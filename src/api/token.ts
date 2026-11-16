/** Сессионный bearer локального API. Только память + зашифрованный файл vault. */
export function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  const b64 = btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  return `lcc_${b64}`
}

export function bearerMatches(expected: string | null | undefined, presented: string | null): boolean {
  if (!expected || !presented) return false
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(presented)
  if (a.length !== b.length || a.length < 16) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!
  return diff === 0
}
