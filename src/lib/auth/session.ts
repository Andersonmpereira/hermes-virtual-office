import { createHmac, timingSafeEqual } from 'node:crypto'
import { authConfig } from './config'

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const SESSION_COOKIE = 'office_session'

type Payload = { u: string; exp: number }

function secret(): string | null {
  return authConfig()?.sessionSecret ?? null
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function createSessionToken(username: string, now = Date.now()): string | null {
  const key = secret()
  if (!key) return null
  const body: Payload = { u: username, exp: now + SESSION_TTL_MS }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payload}.${sign(payload, key)}`
}

export function readSessionToken(token: string | undefined | null, now = Date.now()): { username: string } | null {
  const key = secret()
  if (!key || !token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(payload, key)
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  let data: Payload
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Payload
  } catch {
    return null
  }
  if (!data || typeof data.u !== 'string' || typeof data.exp !== 'number') return null
  if (data.exp < now) return null
  const user = authConfig()?.username
  if (!user || data.u !== user) return null
  return { username: data.u }
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function cookieIsSecure(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  return proto === 'https'
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (key !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}
