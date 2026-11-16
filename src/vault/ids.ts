/** Id сущности в пути `{collection}/{id}.json.enc`. Без сепараторов и `..`. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/

export function isSafeEntityId(id: string): boolean {
  if (!ID_RE.test(id)) return false
  if (id.includes('..')) return false
  return true
}

export function assertSafeEntityId(id: string): string {
  const trimmed = id.trim()
  if (!isSafeEntityId(trimmed)) {
    throw new Error('Некорректный id')
  }
  return trimmed
}
