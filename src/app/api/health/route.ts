import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Sonda vazia para o proxy. Não revela sessão, Hermes nem configuração. */
export function GET() {
  return NextResponse.json({ ok: true })
}
