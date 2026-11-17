/** Только `MAJOR.MINOR.PATCH` из цифр. Префикс v, pre-release и мусор — null. */
export function parseSemver(input: string): [number, number, number] | null {
  if (typeof input !== 'string') return null
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input)
  if (!match) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return null
  }
  return [major, minor, patch]
}

/** true только если обе версии разобрались и remote строго больше local. */
export function isNewerVersion(remote: string, local: string): boolean {
  const next = parseSemver(remote)
  const current = parseSemver(local)
  if (!next || !current) return false
  if (next[0] !== current[0]) return next[0] > current[0]
  if (next[1] !== current[1]) return next[1] > current[1]
  return next[2] > current[2]
}
