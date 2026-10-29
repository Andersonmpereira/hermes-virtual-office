import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const N = 16384
const R = 8
const P = 1
const KEYLEN = 32

/** Hash scrypt para gravar em OFFICE_PASSWORD_HASH. Não registra a senha. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  if (n !== N || r !== R || p !== P) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'base64')
    expected = Buffer.from(parts[5], 'base64')
  } catch {
    return false
  }
  if (salt.length < 8 || expected.length !== KEYLEN) return false
  // Teto evita que um hash enorme no ambiente trave o processo.
  const actual = scryptSync(password.slice(0, 1024), salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}
