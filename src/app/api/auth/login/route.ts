import { NextResponse } from 'next/server'
import { assertLocalWriteRequest } from '@/lib/local-guard'
import { authConfigured } from '@/lib/auth/config'
import { attemptLogin, clearFailures, clientKey, recordFailure, tooManyAttempts } from '@/lib/auth/login'
import { cookieIsSecure, sessionCookieHeader } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const INVALID = 'Usuário ou senha inválidos.'

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: { code: 'auth_unconfigured', message: 'Autenticação do painel não configurada.', status: 503 } },
      { status: 503 },
    )
  }
  const denied = assertLocalWriteRequest(req)
  if (denied) return denied

  const key = clientKey(req)
  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Muitas tentativas. Espere alguns minutos.', status: 429 } },
      { status: 429 },
    )
  }

  let username = ''
  let password = ''
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown }
    username = typeof body.username === 'string' ? body.username : ''
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    username = ''
    password = ''
  }

  const result = attemptLogin(username.trim(), password)
  if (!result.ok) {
    recordFailure(key)
    return NextResponse.json(
      { error: { code: 'invalid_credentials', message: INVALID, status: 401 } },
      { status: 401 },
    )
  }
  clearFailures(key)
  const res = NextResponse.json({ ok: true })
  res.headers.append('Set-Cookie', sessionCookieHeader(result.token, cookieIsSecure(req)))
  return res
}
