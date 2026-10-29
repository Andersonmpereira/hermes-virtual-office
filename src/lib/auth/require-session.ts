import { NextResponse } from 'next/server'
import { assertLocalWriteRequest } from '@/lib/local-guard'
import { authConfigured } from './config'
import { readCookie, readSessionToken, SESSION_COOKIE } from './session'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function unauthenticated(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'unauthenticated',
        message: 'É preciso entrar para continuar.',
        status: 401,
      },
    },
    { status: 401 },
  )
}

export function authUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'auth_unconfigured',
        message: 'Autenticação do painel não configurada.',
        status: 503,
      },
    },
    { status: 503 },
  )
}

/**
 * Sessão válida para qualquer método. Escrita também passa pelo guard de origem.
 * Devolve a resposta de bloqueio, ou null quando a requisição pode seguir.
 */
export function requireSession(req: Request): NextResponse | null {
  if (!authConfigured()) return authUnavailable()
  const session = readSessionToken(readCookie(req, SESSION_COOKIE))
  if (!session) return unauthenticated()
  if (MUTATING.has(req.method.toUpperCase())) {
    return assertLocalWriteRequest(req)
  }
  return null
}
