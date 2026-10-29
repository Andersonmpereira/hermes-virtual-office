'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import { fetchJson } from '@/lib/api'
import ModelPicker, { type ModelChoice } from './ModelPicker'
import RestartNotice from './RestartNotice'
import { DIVISION_LABEL, type AgentDivision, type AgentRole } from '@/types/hermes'

/**
 * Spawn prompt for a DUMMY avatar.
 *
 * A dummy is decoration: a row in `avatar_state` with `kind: 'dummy'` and no model
 * behind it. Clicking one offers to replace it with a REAL Hermes agent — that is
 * the only way an avatar in this office ever starts costing tokens (poin 4 + 10).
 *
 * Tiga hal yang DIPASTIKAN di sini (SPAWN-A2A-1):
 * - A2A OTOMATIS: pendaftaran served-agent default di SISI SERVER (route
 *   `agents` mendaftarkan kecuali serveA2a:false eksplisit) — jalur ini tidak
 *   perlu mengirim flag, dan TIDAK BOLEH mematikan.
 * - SATU BADAN: klaim slot lewat aksi server `claimAvatar` — baris kanonik
 *   `agent:<nama>` dipindah ke posisi slot, bukan dibuatkan baris kedua.
 * - Role mengikuti slot: manager = manager, staff = keahlian divisinya
 *   (tech→backend, growth→marketing, content→content, exec→manager).
 */

function roleForSlot(avatarId: string, division: AgentDivision): AgentRole {
  void avatarId
  if (division === 'tech') return 'backend'
  if (division === 'growth') return 'marketing'
  if (division === 'content') return 'content'
  return 'manager'
}

export default function DummySpawnDialog({
  avatarId,
  division,
  onClose,
}: {
  avatarId: string
  division: AgentDivision
  onClose: () => void
}) {
  const agents = useOffice((s) => s.agents)
  const loadOffice = useOffice((s) => s.loadOffice)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [models, setModels] = useState<ModelChoice[]>([])
  /** '' = bawaan Hermes: tidak memilih berarti tidak memaksa model apa pun. */
  const [model, setModel] = useState('')
  /** Laporan hasil spawn. Dialog sengaja TIDAK langsung tertutup supaya operator
   *  melihat model yang benar-benar dipakai, bukan sekadar avatar yang berubah. */
  const [done, setDone] = useState<string | null>(null)
  /** Pop up "silahkan restart server" — Tampil setelah pendaftaran A2A sukses. */
  const [restartFor, setRestartFor] = useState<string | null>(null)

  // Katalog model = config Hermes, bukan daftar hardcode; dimuat sekali per dialog.
  useEffect(() => {
    let alive = true
    fetchJson<{ models?: ModelChoice[] }>('/api/hermes/models', { cache: 'no-store' }).then((res) => {
      if (alive && res.ok) setModels(res.data?.models || [])
    })
    return () => {
      alive = false
    }
  }, [])

  // Default the name to a free profile in this division, so the common case is
  // one click.
  useEffect(() => {
    // Setelah spawn, loadOffice() memperbarui `agents`; tanpa penjaga ini nama di
    // field melompat ke slot bebas berikutnya tepat saat laporan ditampilkan.
    if (done) return
    const taken = new Set(agents.map((a) => a.name))
    const base = division === 'tech' ? 'dev' : division === 'growth' ? 'mkt' : 'content'
    for (let i = 1; i < 50; i++) {
      const cand = `${base}-${i}`
      if (!taken.has(cand)) {
        setName(cand)
        return
      }
    }
  }, [agents, division, done])

  async function spawn() {
    if (done) return
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (!clean) {
      setNote('O nome do agente é obrigatório.')
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/hermes/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: clean,
          division,
          // Role mengikuti slot (bukan hardcode 'manager' untuk semua).
          role: roleForSlot(avatarId, division),
          model: model || undefined,
          provider: model ? models.find((m) => m.model === model)?.provider : undefined,
          // A2A: TIDAK dikirim = server default NYALA (SPAWN-A2A-1).
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        model?: string | null
        modelError?: string | null
        a2aRegistered?: boolean | null
        a2aError?: string | null
      }
      if (!res.ok) {
        setNote(body?.error?.message || 'não foi possível criar o perfil')
        setBusy(false)
        return
      }
      // Daftarkan A2A GAGAL = katakan gagal — jangan tampilkan pop up sukses.
      // Profilnya tetap ada (server tidak membatalkan create), tapi operator
      // harus tahu dia belum terdaftar.
      if (body.a2aRegistered === false) {
        setNote(
          `Perfil "${clean}" criado, mas FALHOU ao registrar no A2A (${body.a2aError ?? 'motivo ilegível'}) — ` +
            `o perfil existe, mas ainda não está registrado. Ligue manualmente no painel Agentes.`,
        )
        setBusy(false)
        return
      }
      // Klaim slot lewat server: satu agent = satu baris kanonik. Gagal klaim
      // = laporkan jujur (profil sudah jadi, badan belum pindah).
      const claim = await fetch('/api/hermes/office', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'claimAvatar', avatarId, name: clean }),
      })
      const claimBody = (await claim.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      await loadOffice()
      if (!claim.ok) {
        setNote(
          `Perfil "${clean}" criado e registrado no A2A, mas o corpo FALHOU ao ir para o lugar ` +
            `(${claimBody?.error?.message ?? 'motivo ilegível'}) — atualize a página; o agente entra pela porta principal.`,
        )
        setBusy(false)
        return
      }
      // Dari balasan server, bukan dari pilihan form: set-model bisa gagal walau
      // profilnya sudah jadi.
      setDone(
        body.model
          ? `Agente "${clean}" criado com o modelo ${body.model}.`
          : body.modelError
            ? `Agente "${clean}" criado, mas o modelo FALHOU (${body.modelError}) — por enquanto usa o padrão do Hermes. Troque no painel Agentes.`
            : `Agente "${clean}" criado com o modelo padrão do Hermes.`,
      )
      // Pendaftaran A2A sukses (default NYALA) → pop up restart.
      if (body.a2aRegistered === true) setRestartFor(clean)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (restartFor) return <RestartNotice agentName={restartFor} onClose={() => { setRestartFor(null); onClose() }} />

  return (
    <div className="vp-modal-backdrop" onClick={onClose}>
      <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Criar agente neste lugar</h3>
        <p className="vp-sub">
          Este lugar ainda é um avatar decorativo (grátis, não gasta token). Se criar o agente, ele vira um agente
          Hermes de verdade, com SOUL.md, e passa a poder executar tarefas — e a gastar token.
        </p>
        <p className="vp-note">
          Registrado automaticamente no A2A; vale depois de reiniciar o gateway. Papel deste lugar: {roleForSlot(avatarId, division)}.
        </p>
        <label className="vp-field">
          <span>Nome do agente</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="dev-1"
            disabled={busy || !!done}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void spawn()
            }}
          />
        </label>
        <label className="vp-field">
          <span>Model AI</span>
          <ModelPicker
            value={model}
            onChange={setModel}
            models={models}
            disabled={busy || !!done}
            emptyLabel="padrão do Hermes"
            title="Modelo deste agente (vazio = padrão do Hermes)"
          />
        </label>
        <p className="vp-muted">Divisão: {DIVISION_LABEL[division]}</p>
        {note && <p className="vp-error">{note}</p>}
        {done && <div className="vp-ok">{done}</div>}
        <div className="vp-modal-actions">
          {done ? (
            <button className="vp-btn primary" onClick={onClose} autoFocus>
              Fechar
            </button>
          ) : (
            <>
              <button className="vp-btn" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button className="vp-btn primary" onClick={() => void spawn()} disabled={busy}>
                {busy ? 'Criando…' : 'Criar agente'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
