'use client'

import { useEffect, useState } from 'react'
import { fetchJson } from '@/lib/api'
import ModelPicker, { type ModelChoice } from './ModelPicker'
import type { AgentDivision, AgentRole } from '@/types/hermes'
import { DIVISION_LABEL } from '@/types/hermes'
import { AGENT_STATUS_LABEL, ORG_DEPARTMENTS } from '@/lib/office/org'
import { ROLE_LABEL } from '@/lib/hermes/soul'
import FullPanel from './FullPanel'
import RestartNotice from './RestartNotice'

/**
 * Spawn / hide / kill control.
 *
 * "Sembunyikan" and "Spawn" toggle office MEMBERSHIP
 * (src/lib/hermes/office-membership.ts): the avatar leaves or enters, the profile
 * and its tasks are untouched. "Kill" is the destructive one — it deletes the
 * profile and purges its tasks — so it is only offered when a profile exists and
 * asks for a second click.
 */

type Row = {
  name: string
  total: number
  /** The profile exists on disk, not only as a task assignee. */
  profile: boolean
  inOffice: boolean
  reason: string | null
  /** The profile's default model, when it has one. */
  model?: string | null
  /** Role dari route agents GET; null/undefined bila backend lama. */
  role?: AgentRole | string | null
  /** Divisi dari route agents GET; null/undefined bila backend lama. */
  division?: AgentDivision | string | null
  /** Departamento do escritório. null = ainda não associado. */
  orgDepartment?: string | null
  /** Status real do Hermes, quando a rota o enviou. */
  status?: string | null
  /** True bila profil punya SOUL.md sendiri. */
  soulExists?: boolean | null
  /** Keahlian/domain (dipakai office, bukan A2A). */
  domains?: string[]
  /**
   * Status A2A jujur: 'served' = terdaftar di platforms.a2a.agents,
   * 'unlisted' = belum didaftarkan. Bukan "aktif" — berlaku pasca-restart.
   */
  a2a?: 'served' | 'unlisted' | null
}

/** Batas izin per role dari route agents GET (tabel tunggal di control.ts). */
type Permissions = Record<string, { allow: string[]; deny: string[]; anyTask: boolean }>

const ROLE_OPTIONS = Object.entries(ROLE_LABEL) as [AgentRole, string][]
const DIVISION_OPTIONS = Object.entries(DIVISION_LABEL) as [AgentDivision, string][]

export default function AgentSpawnPanel({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [perms, setPerms] = useState<Permissions>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newRole, setNewRole] = useState<AgentRole>('backend')
  const [newDivision, setNewDivision] = useState<AgentDivision>('tech')
  const [newSoul, setNewSoul] = useState('')
  /**
   * Keahlian/domain: freetext koma ("meta-ads, reporting"). Disimpan di
   * marker SOUL.md (pemetaan office), TIDAK diumumkan ke A2A — skills di
   * agent card hanya bisa berisi toolset Hermes yang nyata.
   */
  const [newDomains, setNewDomains] = useState('')
  /**
   * Toolset yang diumumkan di agent card. Kosong = semua toolset.
   * Hanya nama toolset nyata (dari /api/hermes/toolsets), bukan tag bebas.
   */
  const [newToolsets, setNewToolsets] = useState<string[]>([])
  const [toolsetCatalog, setToolsetCatalog] = useState<{ name: string; enabled: boolean }[]>([])
  /**
   * Toggle A2A: default NYALA (permintaan operator: spawn dari mana pun harus
   * langsung A2A). Hidup = daftarkan served-agent (local:false). Berlaku
   * setelah gateway di-restart — form tidak janji "langsung aktif".
   */
  const [newServeA2a, setNewServeA2a] = useState(true)
  /** Domain yang tidak punya pemilik: dinyatakan apa adanya, bukan diarang. */
  const [domainOwners, setDomainOwners] = useState<Record<string, string | null>>({})
  /** Model untuk profil yang SEDANG dibuat; '' = bawaan Hermes. Terpisah dari `pick`
   *  (ganti model profil yang sudah ada) supaya dua alur itu tidak saling menimpa. */
  const [newModel, setNewModel] = useState('')
  const [soulPreview, setSoulPreview] = useState<string | null>(null)
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  /** id awaiting the second click before a destructive delete. */
  const [confirmKill, setConfirmKill] = useState<string | null>(null)
  const [models, setModels] = useState<ModelChoice[]>([])
  /** name -> model being picked but not yet saved. */
  const [pick, setPick] = useState<Record<string, string>>({})
  /**
   * Keadaan "butuh restart" dari server (SATU sumber kebenaran — pembanding
   * yang sama dipakai doctor). null = tak bisa dipastikan (tampil abu).
   */
  const [needsGatewayRestart, setNeedsGatewayRestart] = useState<boolean | null>(null)
  /** Pop up "silahkan restart server" — tampil setelah pendaftaran A2A sukses. */
  const [restartFor, setRestartFor] = useState<string | null>(null)

  // A click anywhere else cancels a pending delete.
  useEffect(() => {
    if (!confirmKill) return
    const cancel = () => setConfirmKill(null)
    window.addEventListener('click', cancel)
    return () => window.removeEventListener('click', cancel)
  }, [confirmKill])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetchJson<{ available?: Row[]; permissions?: Permissions; domainOwners?: Record<string, string | null>; needsGatewayRestart?: boolean | null }>('/api/hermes/agents', {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(res.error || 'não foi possível carregar a lista de agentes')
      setRows(res.data?.available || [])
      setPerms(res.data?.permissions || {})
      setDomainOwners(res.data?.domainOwners || {})
      setNeedsGatewayRestart(res.data?.needsGatewayRestart ?? null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  // Katalog toolset + model: config, bukan roster — fetch sekali per buka.
  useEffect(() => {
    if (!open) return
    if (!models.length) {
      let alive = true
      fetchJson<{ models?: ModelChoice[] }>('/api/hermes/models', { cache: 'no-store' }).then((res) => {
        if (alive && res.ok) setModels(res.data?.models || [])
      })
      return () => {
        alive = false
      }
    }
  }, [open, models.length])
  useEffect(() => {
    if (!open || toolsetCatalog.length) return
    let alive = true
    fetchJson<{ toolsets?: { name: string; enabled: boolean }[] }>('/api/hermes/toolsets', { cache: 'no-store' }).then((res) => {
      if (alive && res.ok) setToolsetCatalog(res.data?.toolsets || [])
    })
    return () => {
      alive = false
    }
  }, [open, toolsetCatalog.length])

  async function setModel(name: string, model: string) {
    setBusy(name)
    setErr(null)
    setNote(null)
    try {
      const hit = models.find((m) => m.model === model)
      const res = await fetchJson('/api/hermes/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-model', name, model, provider: hit?.provider }),
      })
      if (!res.ok) throw new Error(res.error || 'não foi possível salvar o modelo')
      setNote(`Model "${name}" diset ke ${model} — berlaku pada spawn/chat berikutnya.`)
      await load()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function act(action: 'spawn' | 'hide' | 'kill' | 'serve' | 'unserve', name: string) {
    setBusy(name)
    setErr(null)
    setNote(null)
    try {
      const res = await fetchJson<{
        purged?: number
        a2aNote?: string | null
        peerAdded?: boolean | null
        peerError?: string | null
        toolsetAdded?: boolean | null
        toolsetError?: string | null
        needsGatewayRestart?: boolean | null
      }>('/api/hermes/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name }),
      })
      if (!res.ok) throw new Error(res.error || 'a ação falhou')
      const d = res.data
      if (action === 'kill') {
        const n = Number(d?.purged ?? 0)
        setNote(
          n > 0
            ? `"${name}" excluído de vez, junto com ${n} tarefas`
            : `"${name}" excluído de vez`,
        )
      } else if (action === 'hide') {
        setNote(`"${name}" oculto — as tarefas continuam no quadro`)
      } else if (action === 'serve') {
        // SELFREPAIR-1 Celah 1: jujur — terdaftar, tapi BERLAKU SETELAH
        // restart gateway (bukan langsung "siap"). A2A-CALL-1: pratinjau +
        // laporan kemampuan MEMANGGIL (peer + toolset, idempoten).
        const callBits: string[] = []
        if (d?.toolsetAdded === true) callBits.push('toolset a2a adicionado (pode chamar)')
        else if (d?.toolsetAdded === false && d?.toolsetError) callBits.push(`toolset a2a FALHOU (${d.toolsetError})`)
        else callBits.push('toolset a2a já existe (pode chamar)')
        if (d?.peerAdded === true) callBits.push(`peer ${name}-local registrado`)
        else if (d?.peerAdded === false && d?.peerError) callBits.push(`peer FALHOU (${d.peerError})`)
        else callBits.push(`peer ${name}-local já existe`)
        setNote(`"${name}" ${d?.a2aNote ?? 'registrado. Vale depois de reiniciar o gateway.'} ${callBits.join(' · ')}.`)
        if (d?.needsGatewayRestart != null) setNeedsGatewayRestart(d.needsGatewayRestart)
      } else if (action === 'unserve') {
        setNote(`"${name}" ${d?.a2aNote ?? 'removido da configuração.'}`)
      }
      await load()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function create() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setErr(null)
    setNote(null)
    setSoulPreview(null)
    try {
      const hit = models.find((m) => m.model === newModel)
      const res = await fetchJson<{
        name: string
        soulPreview?: string
        model?: string | null
        modelError?: string | null
        domains?: string[]
        a2aRegistered?: boolean | null
        a2aError?: string | null
        toolsetAdded?: boolean | null
        toolsetError?: string | null
        peerAdded?: boolean | null
        peerError?: string | null
        a2aNote?: string | null
        needsGatewayRestart?: boolean | null
      }>('/api/hermes/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          description: newDesc.trim(),
          role: newRole,
          division: newDivision,
          soul: newSoul.trim(),
          domains: newDomains.trim(),
          advertisedToolsets: newToolsets,
          serveA2a: newServeA2a,
          model: newModel || undefined,
          provider: newModel ? hit?.provider : undefined,
        }),
      })
      if (!res.ok || !res.data) throw new Error(res.error || 'não foi possível criar o perfil')
      setNewName('')
      setNewDesc('')
      setNewSoul('')
      setNewDomains('')
      setNewToolsets([])
      setNewServeA2a(true)
      setNewModel('')
      setSoulPreview(res.data.soulPreview ?? null)
      // Laporkan model dari BALASAN server, bukan dari pilihan di form: kalau set-model
      // gagal, operator harus tahu agent ini jalan dengan bawaan Hermes.
      const modelNote = res.data.model
        ? `model ${res.data.model}`
        : res.data.modelError
          ? `modelo FALHOU (${res.data.modelError}) — por enquanto usa o padrão do Hermes`
          : 'modelo padrão do Hermes'
      const domNote = res.data.domains?.length ? `especialidade: ${res.data.domains.join(', ')} (mapeamento do office, não é A2A). ` : ''
      const a2aNote = res.data.a2aRegistered === true
        ? `${res.data.a2aNote ?? 'Salvo. Vale depois de reiniciar o gateway.'} `
        : res.data.a2aRegistered === false
          ? `FALHOU ao registrar no A2A (${res.data.a2aError}) — o perfil existe, mas ainda não está registrado. `
          : 'A2A não foi registrado (interruptor desligado) — o perfil existe, mas ainda não está registrado. Ligue manualmente se precisar. '
      // A2A-CALL-1: kemampuan MEMANGGIL ikut dilaporkan (pratinjau + laporan,
      // idempoten — dua kali jalan tak menggandakan).
      const callNote = res.data.a2aRegistered === true
        ? (res.data.toolsetAdded === true
          ? 'toolset a2a adicionado (pode chamar). '
          : res.data.toolsetAdded === false && res.data.toolsetError
            ? `toolset a2a FALHOU (${res.data.toolsetError}). `
            : 'toolset a2a já existe (pode chamar). ') +
          (res.data.peerAdded === true
            ? `peer ${res.data.name}-local registrado (o nome pode ser resolvido). `
            : res.data.peerAdded === false && res.data.peerError
              ? `peer FALHOU (${res.data.peerError}). `
              : `peer ${res.data.name}-local já existe. `)
        : ''
      setNote(`perfil "${res.data.name}" criado, ${modelNote} — o agente entra pela porta principal. ${domNote}${a2aNote}${callNote}`)
      setNeedsGatewayRestart(res.data.needsGatewayRestart ?? null)
      // Pendaftaran A2A sukses → pop up "silahkan restart server". Gagal =
      // JANGAN tampilkan pop up sukses (catatan di atas sudah bilang gagal).
      if (res.data.a2aRegistered === true) setRestartFor(res.data.name)
      await load()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function assignDepartment(name: string, department: string) {
    setBusy(name)
    setErr(null)
    try {
      const res = await fetchJson('/api/hermes/office', {
        method: 'POST',
        body: JSON.stringify({ action: 'setDepartment', name, department }),
      })
      if (!res.ok) throw new Error(res.error || 'não foi possível salvar o departamento')
      await load()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  const matchDept = (r: Row) =>
    deptFilter === 'all' || (deptFilter === 'none' ? !r.orgDepartment : r.orgDepartment === deptFilter)
  const inOffice = rows.filter((r) => r.inOffice && matchDept(r))
  const out = rows.filter((r) => !r.inOffice && matchDept(r))

  /** Badge role + divisi + indikator soul + status A2A. Aman bila field null (backend lama). */
  function badges(r: Row) {
    const roleLabel = r.role ? (ROLE_LABEL as Record<string, string>)[r.role] ?? r.role : null
    const divLabel = r.division ? (DIVISION_LABEL as Record<string, string>)[r.division] ?? null : null
    return (
      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
        {roleLabel && (
          <span className="vp-chip" title={`role: ${r.role}`}>
            {roleLabel}
          </span>
        )}
        {divLabel && (
          <span className="vp-chip" title="Divisão gravada no perfil Hermes. O departamento do escritório é outra coisa.">
            {divLabel}
          </span>
        )}
        {r.status && AGENT_STATUS_LABEL[r.status] && (
          <span className="vp-chip" title={`status Hermes: ${r.status}`}>
            {AGENT_STATUS_LABEL[r.status]}
          </span>
        )}
        {r.model && (
          <span className="vp-chip" title="modelo padrão do perfil">
            {r.model}
          </span>
        )}
        {(r.domains?.length ?? 0) > 0 && (
          <span className="vp-chip" title={`keahlian (pemetaan office, bukan A2A): ${(r.domains ?? []).join(', ')}`}>
            {(r.domains ?? []).join(', ')}
          </span>
        )}
        {r.soulExists === true && (
          <span className="vp-chip" title="Profil ini punya SOUL.md sendiri">
            soul ✓
          </span>
        )}
        {r.soulExists === false && <span className="vp-tag-warn">sem soul</span>}
        {a2aBadge(r)}
      </span>
    )
  }

  /**
   * Checklist "A2A Ready" per agent — tiga nilai jujur, SATU sumber kebenaran
   * (entri served + needsGatewayRestart dari server, pembanding yang sama
   * dipakai doctor):
   * - ✅ A2A Ready: terdaftar DAN gateway sudah restart sesudahnya.
   * - 🟡 Terdaftar, belum aktif: ada entri tapi config lebih baru dari start.
   * - ❌ Belum terdaftar: tidak ada entri served.
   * needsGatewayRestart null = tak bisa dipastikan → abu, bukan hijau.
   */
  function a2aBadge(r: Row) {
    if (r.a2a !== 'served') {
      // SELFREPAIR-1 Celah 1: agent `unlisted` (profil ada, belum didaftarkan)
      // bisa didaftarkan dari UI — aksi `serve` + kalimat jujur (berlaku
      // setelah restart). Profil tak ada (null) = tak ada tombol.
      if (r.a2a === 'unlisted' && r.profile) {
        return (
          <span className="flex flex-wrap items-center gap-2">
            <span className="vp-tag-warn" title="Não há entrada em platforms.a2a.agents">
              ❌ Ainda não registrado no A2A
            </span>
            <button
              className="vp-chip-btn"
              disabled={busy === r.name}
              onClick={(e) => {
                e.stopPropagation()
                void act('serve', r.name)
              }}
              title="Registra este perfil em platforms.a2a.agents (local:false). Vale depois de reiniciar o gateway."
            >
              {busy === r.name ? '…' : 'registrar no A2A'}
            </button>
          </span>
        )
      }
      return (
        <span className="vp-tag-warn" title="Não há entrada em platforms.a2a.agents — ligue o A2A deste agente">
          ❌ Ainda não registrado no A2A — ligue o A2A deste agente
        </span>
      )
    }
    if (needsGatewayRestart === true) {
      return (
        <span className="vp-tag-warn" title="Está em platforms.a2a.agents, mas o config.yaml é mais novo que a inicialização do gateway — a lista nova só vale depois do restart">
          🟡 Registrado, ainda inativo — precisa reiniciar o gateway
        </span>
      )
    }
    if (needsGatewayRestart === false) {
      return (
        <span className="vp-chip" title="Registrado e o gateway já reiniciou depois disso — pode ser chamado de verdade">
          ✅ A2A pronto — este agente já pode ser chamado
        </span>
      )
    }
    return (
        <span className="vp-tag-warn" title="Registrado, mas a hora de início do gateway não foi lida — não dá para confirmar se já está ativo">
        A2A registrado (ativo incerto — início do gateway ilegível)
      </span>
    )
  }

  /** Satu baris batas izin untuk role agent ini. Kosong bila role/tabel tidak ada. */
  function limits(r: Row) {
    const p = r.role ? perms[r.role] : undefined
    if (!p) return null
    const allow = p.allow.length
      ? p.allow.join(', ') + (p.anyTask ? '' : ' (só a própria tarefa)')
      : '—'
    return (
      <span className="vp-muted" style={{ fontSize: 11 }} title="Limite de permissão quando a ação é pedida em nome deste agente">
        pode: {allow} · não pode: {p.deny.length ? p.deny.join(', ') : '—'}
      </span>
    )
  }

  return (
    <FullPanel onClose={onClose} label="Agent" title="Agent" bodyClassName="vp-pad flex flex-col gap-3">
      {restartFor && <RestartNotice agentName={restartFor} onClose={() => setRestartFor(null)} />}
      <div className="vp-kv">
        <span>no escritório</span>
        <b>{inOffice.length}</b>
      </div>
      <div className="vp-kv">
        <span>perfis disponíveis</span>
        <b>{rows.length}</b>
      </div>
      {needsGatewayRestart === true && (
        <div className="vp-err">
          🟡 A configuração é mais nova que a inicialização do gateway — a entrada served está salva, mas AINDA NÃO está ativa. Reinicie o gateway para
          ativá-la.
        </div>
      )}

      {err && <div className="vp-err">{err}</div>}
      {note && <div className="vp-ok">{note}</div>}
      {soulPreview && (
        <div className="vp-ok">
          <b>Soul salvo:</b>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11 }}>{soulPreview}</pre>
        </div>
      )}
      {loading && <div className="vp-muted">carregando…</div>}

      <div className="vp-sub">CRIAR PERFIL</div>
      <input
        className="vp-input"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="budi"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create()
        }}
      />
      {/*
        Deskripsi = `description` di agent card A2A: teks yang dibaca agent
        pemanggil untuk memutuskan "ini orangnya". Tulis BUAT DIBACA AGENT
        LAIN (kosakata domain yang akan dicari), bukan sekadar label manusia.
      */}
      <textarea
        className="vp-input"
        value={newDesc}
        onChange={(e) => setNewDesc(e.target.value)}
        placeholder="Descrição do agent card — LIDA POR OUTROS AGENTES na descoberta. Escreva o vocabulário do domínio que vão procurar, ex.: cuida de anúncios Meta e Google: orçamento, CPA, relatório semanal de performance."
        rows={2}
      />
      {/*
        Keahlian/domain: daftar koma ("meta-ads, reporting"). Dipakai OFFICE
        untuk pemetaan domain→pemilik — TIDAK diumumkan ke A2A (skills di card
        hanya bisa berisi toolset Hermes yang nyata, lihat pilihan di bawah).
      */}
      <input
        className="vp-input"
        value={newDomains}
        onChange={(e) => setNewDomains(e.target.value)}
        placeholder="Especialidade/domínio, separados por vírgula — ex.: meta-ads, reporting, budget (mapeamento do office, não é A2A)"
      />
      <div className="flex gap-2">
        <select
          className="vp-input"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as AgentRole)}
          title="Role agent"
        >
          {ROLE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="vp-input"
          value={newDivision}
          onChange={(e) => setNewDivision(e.target.value as AgentDivision)}
          title="Divisi agent"
        >
          {DIVISION_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="vp-input"
        value={newSoul}
        onChange={(e) => setNewSoul(e.target.value)}
        placeholder="cth: Budi adalah CEO visioner — ambil keputusan akhir, bagi tugas ke tiap divisi, jaga visi perusahaan. Gaya: tegas, ringkas, eksekusi langsung. (opsional)"
        rows={3}
      />
      <ModelPicker
        value={newModel}
        onChange={setNewModel}
        models={models}
        disabled={creating}
        emptyLabel="bawaan Hermes"
        title="Model untuk agent baru ini (kosong = bawaan Hermes)"
      />
      {/*
        Toolset yang DIUMUMKAN di agent card (`advertised_toolsets`). Hanya
        nama toolset nyata Hermes — skills di card diturunkan dari registry,
        bukan tag bebas. Kosong = umumkan semua toolset.
      */}
      <div className="vp-sub" title="Toolset nyata yang diumumkan di agent card A2A. Kosong = semua.">
        UMUMKAN DI AGENT CARD (KOSONG = SEMUA)
      </div>
      <div className="flex flex-wrap gap-1" style={{ maxHeight: 120, overflowY: 'auto' }}>
        {toolsetCatalog.map((t) => {
          const on = newToolsets.includes(t.name)
          return (
            <button
              key={t.name}
              type="button"
              className={`vp-chip-btn${on ? ' on' : ''}`}
              disabled={creating}
              onClick={() =>
                setNewToolsets((prev) => (prev.includes(t.name) ? prev.filter((x) => x !== t.name) : [...prev, t.name]))
              }
              title={`${t.name}${t.enabled ? '' : ' (inativo nesta instalação)'}`}
              style={{ opacity: t.enabled ? 1 : 0.55 }}
            >
              {on ? '✓ ' : ''}{t.name}
            </button>
          )
        })}
        {!toolsetCatalog.length && <span className="vp-muted">carregando a lista de toolsets…</span>}
      </div>
      {/*
        Toggle A2A: default NYALA (permintaan operator). Hidup = tulis entri
        served-agent (local:false, dijawab profil ini sendiri). BERLAKU SETELAH
        GATEWAY DI-RESTART — form tidak menampilkan "aktif" sebelum itu.
      */}
      <label className="flex items-center gap-2" style={{ fontSize: 12 }}>
        <input
          type="checkbox"
          checked={newServeA2a}
          disabled={creating}
          onChange={(e) => setNewServeA2a(e.target.checked)}
        />
        <span title="Registra este perfil em platforms.a2a.agents (local:false). Vale depois de reiniciar o gateway.">
          Pode ser chamado por outros agentes (A2A) — registrado automaticamente no A2A; vale depois de reiniciar o gateway
        </span>
      </label>
      <button
        className="vp-btn"
        disabled={creating || !newName.trim()}
        onClick={create}
      >
        {creating ? 'Criando…' : '+ Criar perfil'}
      </button>

      <button className="vp-btn vp-btn-rosy" disabled={!!busy} onClick={load}>
        Atualizar
      </button>

      {/*
        Pemetaan domain→pemilik (dipakai office, bukan A2A). Domain tanpa
        pemilik = null → TAMPILKAN "tidak ada pemilik", jangan mengarang.
      */}
      {Object.keys(domainOwners).length > 0 && (
        <>
          <div className="vp-sub">QUEM CUIDA DE QUÊ (OFFICE, NÃO É A2A)</div>
          <div className="flex flex-col gap-1">
            {Object.entries(domainOwners).map(([d, owner]) => (
              <div key={d} className="vp-kv">
                <span>{d}</span>
                <b>{owner ?? 'sem dono'}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="vp-sub">DEPARTAMENTOS</div>
      <div className="flex flex-col gap-1">
        {ORG_DEPARTMENTS.map((d) => {
          const n = rows.filter((r) => r.inOffice && r.orgDepartment === d.id).length
          return (
            <div key={d.id} className="vp-kv" title={d.note}>
              <span>{d.label}</span>
              <b>
                {n} {n === 1 ? 'agente' : 'agentes'}
                {d.desks > 0 ? ` · ${d.desks} ${d.desks === 1 ? 'mesa' : 'mesas'}` : ' · sem mesas próprias'}
              </b>
            </div>
          )
        })}
      </div>
      <p className="vp-muted" style={{ fontSize: 12 }}>
        Associar um agente muda só o escritório. O perfil, as tarefas e o histórico do Hermes permanecem.
        Uma mesa vazia não é um agente.
      </p>

      <div className="vp-sub">FILTRAR DEPARTAMENTO</div>
      <select
        className="vp-input"
        value={deptFilter}
        onChange={(e) => setDeptFilter(e.target.value)}
        title="Filtra a lista pelo departamento do escritório"
      >
        <option value="all">Todos</option>
        <option value="none">Sem departamento</option>
        {ORG_DEPARTMENTS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>

      <div className="vp-sub">NO ESCRITÓRIO ({inOffice.length})</div>
      <div className="flex flex-col gap-2">
        {inOffice.map((r) => (
          <div key={r.name} className="vp-agent-row">
            <div className="vp-agent-meta">
              <b>
                {r.name}
                {!r.profile && <span className="vp-tag-warn">sem perfil</span>}
              </b>
              <i>{r.total} tarefas</i>
              {badges(r)}
              <select
                className="vp-input"
                value={r.orgDepartment ?? ''}
                disabled={busy === r.name}
                title="Departamento no escritório. Não altera o perfil Hermes."
                onChange={(e) => void assignDepartment(r.name, e.target.value)}
              >
                <option value="">Sem departamento</option>
                {ORG_DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              {limits(r)}
            </div>
            {/* The profile's default model: what its workers and chats run.
                Saving here writes `model.default` for that profile, so it
                applies to every future spawn — not just one task. */}
            {r.profile && (
              <div className="vp-agent-model">
                <ModelPicker
                  value={pick[r.name] ?? r.model ?? ''}
                  onChange={(model) => setPick((p) => ({ ...p, [r.name]: model }))}
                  models={models}
                  disabled={busy === r.name}
                  emptyLabel="padrão do Hermes"
                  title="Modelo padrão deste perfil"
                />
                <button
                  className="vp-btn"
                  disabled={busy === r.name || (pick[r.name] ?? r.model ?? '') === (r.model ?? '')}
                  onClick={(e) => {
                    e.stopPropagation()
                    void setModel(r.name, pick[r.name] ?? '')
                  }}
                >
                  {busy === r.name ? '…' : 'Set'}
                </button>
              </div>
            )}
            {/* Two different things, so two different buttons, and now two
                different actions. A name with no profile on disk is an assignee
                left behind by a task whose profile was deleted — there is
                nothing to delete, and hiding it is the ONLY safe operation:
                sending it to `kill` purged its tasks permanently while the
                button said "tanpa menghapus apa pun". */}
            <div className="flex gap-2">
              <button
                className="vp-btn"
                disabled={busy === r.name}
                onClick={(e) => {
                  e.stopPropagation()
                  void act('hide', r.name)
                }}
                title="Tira este nome do escritório sem apagar nada"
              >
                {busy === r.name ? '…' : 'Ocultar'}
              </button>
              {r.profile && (
                <button
                  className={`vp-btn vp-btn-danger ${confirmKill === r.name ? 'vp-btn-armed' : ''}`}
                  disabled={busy === r.name}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirmKill !== r.name) {
                      setConfirmKill(r.name)
                      return
                    }
                    void act('kill', r.name)
                  }}
                  title="Apaga este perfil de vez, inclusive sessões e chaves"
                >
                  {busy === r.name ? '…' : confirmKill === r.name ? 'Excluir mesmo?' : 'Excluir'}
                </button>
              )}
            </div>
          </div>
        ))}
        {confirmKill && (
          <div className="vp-cron-err">
            Excluir <b>{confirmKill}</b> de vez — perfil, sessões, memória, chaves
            <b> e {inOffice.find((x) => x.name === confirmKill)?.total ?? 0} tarefas</b>.
            Clique em outro lugar para cancelar.
          </div>
        )}
        {!inOffice.length && <span className="vp-muted">vazio</span>}
      </div>

      {out.length > 0 && (
        <>
          <div className="vp-sub">FORA DO ESCRITÓRIO ({out.length})</div>
          <div className="flex flex-col gap-2">
            {out.map((r) => (
              <div key={r.name} className="vp-agent-row off">
                <div className="vp-agent-meta">
                  <b>
                    {r.name}
                    {!r.profile && <span className="vp-tag-warn">sem perfil</span>}
                  </b>
                  <i>
                    {r.reason === 'hidden'
                      ? 'oculto'
                      : r.reason === 'no_profile'
                        ? 'sem perfil no disco'
                        : 'sem tarefas'}
                  </i>
                  {badges(r)}
                  <select
                    className="vp-input"
                    value={r.orgDepartment ?? ''}
                    disabled={busy === r.name}
                    title="Departamento no escritório. Não altera o perfil Hermes."
                    onChange={(e) => void assignDepartment(r.name, e.target.value)}
                  >
                    <option value="">Sem departamento</option>
                    {ORG_DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {limits(r)}
                </div>
                <button
                  className="vp-btn"
                  disabled={busy === r.name}
                  onClick={() => act('spawn', r.name)}
                  title="O agente entra pela porta principal e caminha até a mesa"
                >
                  {busy === r.name ? '…' : 'Trazer'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </FullPanel>
  )
}
