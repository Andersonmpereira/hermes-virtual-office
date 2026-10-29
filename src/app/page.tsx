import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import OfficeApp from '@/components/OfficeApp'
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth/session'

export default async function Page() {
  const jar = await cookies()
  if (!readSessionToken(jar.get(SESSION_COOKIE)?.value)) redirect('/login')
  return <OfficeApp />
}
