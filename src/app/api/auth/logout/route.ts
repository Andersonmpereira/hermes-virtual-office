import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/require-session'
import { clearSessionCookieHeader, cookieIsSecure } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const denied = requireSession(req)
  if (denied) return denied
  const res = NextResponse.json({ ok: true })
  res.headers.append('Set-Cookie', clearSessionCookieHeader(cookieIsSecure(req)))
  return res
}
