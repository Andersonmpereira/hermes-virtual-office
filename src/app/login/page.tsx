import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authConfigured } from '@/lib/auth/config'
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth/session'
import LoginForm from './login-form'

// Sem isto o Next gera /login no build, com as variáveis ainda vazias,
// e o HTML "não configurada" fica servido para sempre.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const jar = await cookies()
  if (authConfigured() && readSessionToken(jar.get(SESSION_COOKIE)?.value)) redirect('/')
  return <LoginForm unconfigured={!authConfigured()} />
}
