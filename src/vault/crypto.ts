import { KDF_ITERATIONS, type VaultMeta } from './types'

const te = new TextEncoder()
const td = new TextDecoder()

const MAGIC = te.encode('LCC1')

function b64encode(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s)
}

function b64decode(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  crypto.getRandomValues(out)
  return out
}

export async function createVaultMeta(): Promise<VaultMeta> {
  return {
    version: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: KDF_ITERATIONS,
    saltB64: b64encode(randomBytes(16)),
    createdAt: new Date().toISOString(),
  }
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function deriveKey(password: string, meta: VaultMeta): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBufferSource(b64decode(meta.saltB64)),
      iterations: meta.iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Verify password by round-tripping a known marker. */
export async function sealProbe(key: CryptoKey): Promise<Uint8Array> {
  return encryptBytes(key, te.encode('lcc-ok'))
}

export async function openProbe(key: CryptoKey, blob: Uint8Array): Promise<boolean> {
  try {
    const plain = await decryptBytes(key, blob)
    return td.decode(plain) === 'lcc-ok'
  } catch {
    return false
  }
}

export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(12)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(plain),
    ),
  )
  const out = new Uint8Array(MAGIC.length + iv.length + cipher.length)
  out.set(MAGIC, 0)
  out.set(iv, MAGIC.length)
  out.set(cipher, MAGIC.length + iv.length)
  return out
}

export async function decryptBytes(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (blob[i] !== MAGIC[i]) throw new Error('Неверный формат файла vault')
  }
  const iv = blob.slice(MAGIC.length, MAGIC.length + 12)
  const cipher = blob.slice(MAGIC.length + 12)
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(cipher),
    ),
  )
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  return encryptBytes(key, te.encode(JSON.stringify(value, null, 2)))
}

export async function decryptJson<T>(key: CryptoKey, blob: Uint8Array): Promise<T> {
  const plain = await decryptBytes(key, blob)
  return JSON.parse(td.decode(plain)) as T
}

export { b64encode, b64decode }
