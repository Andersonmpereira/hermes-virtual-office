/**
 * Credenciais do painel. Vêm só do ambiente, em runtime.
 * A senha nunca fica no código: o ambiente guarda o hash scrypt.
 */

const MIN_SECRET = 32

export function authConfig(): {
  username: string
  passwordHash: string
  sessionSecret: string
} | null {
  const username = process.env.OFFICE_USERNAME?.trim() ?? ''
  const passwordHash = process.env.OFFICE_PASSWORD_HASH?.trim() ?? ''
  const sessionSecret = process.env.OFFICE_SESSION_SECRET?.trim() ?? ''
  if (!username || username.length > 64) return null
  if (!passwordHash.startsWith('scrypt$')) return null
  if (sessionSecret.length < MIN_SECRET) return null
  return { username, passwordHash, sessionSecret }
}

export function authConfigured(): boolean {
  return authConfig() !== null
}
