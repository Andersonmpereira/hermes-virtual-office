import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authConfigured } from '@/lib/auth/config'
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth/session'
import LoginForm from './login-form'

export default async function LoginPage() {
  if (authConfigured()) {
    const jar = await cookies()
    if (readSessionToken(jar.get(SESSION_COOKIE)?.value)) redirect('/')
  }
  return <LoginForm unconfigured={!authConfigured()} />
}
