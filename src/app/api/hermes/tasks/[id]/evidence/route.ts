import { NextRequest, NextResponse } from 'next/server'
import { getTaskEvidence } from '@/lib/hermes/kanban'
import { requireSession } from '@/lib/auth/require-session'

export const dynamic = 'force-dynamic'

/**
 * Bukti hasil kerja SATU task: ringkasan terakhir, run terakhir (outcome + metadata), log,
 * lampiran. Gagal membaca `show` = 502, BUKAN daftar bukti kosong — panel harus bisa
 * membedakan "tidak ada bukti" dari "tidak tahu".
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const unauthorized = requireSession(req)
  if (unauthorized) return unauthorized
  const { id } = await ctx.params
  try {
    return NextResponse.json(await getTaskEvidence(id))
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'evidence_failed', message: (err as Error).message, status: 502 } },
      { status: 502 },
    )
  }
}
