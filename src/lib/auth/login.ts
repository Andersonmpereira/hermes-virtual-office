import { authConfig } from './config'
import { safeEqualText, verifyPassword } from './password'
import { createSessionToken } from './session'

const failures = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 8

export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'local'
}

export function tooManyAttempts(key: string, now = Date.now()): boolean {
  const row = failures.get(key)
  if (!row) return false
  if (row.resetAt < now) {
    failures.delete(key)
    return false
  }
  return row.count >= MAX_FAILURES
}

export function recordFailure(key: string, now = Date.now()): void {
  const row = failures.get(key)
  if (!row || row.resetAt < now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  row.count += 1
}

export function clearFailures(key: string): void {
  failures.delete(key)
}

/** Só para teste. */
export function resetLoginAttempts(): void {
  failures.clear()
}

/**
 * Confere usuário e senha. A mensagem de erro é sempre a mesma.
 * O scrypt roda mesmo quando o usuário está errado, para o tempo não entregar a resposta.
 */
export function attemptLogin(username: string, password: string): { ok: true; token: string } | { ok: false } {
  const cfg = authConfig()
  if (!cfg) return { ok: false }
  const userOk = safeEqualText(username, cfg.username)
  const passOk = verifyPassword(password, cfg.passwordHash)
  if (!userOk || !passOk) return { ok: false }
  const token = createSessionToken(cfg.username)
  if (!token) return { ok: false }
  return { ok: true, token }
}
