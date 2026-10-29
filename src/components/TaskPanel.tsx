'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import Collapsible from './Collapsible'
import ModelPicker, { type ModelChoice } from './ModelPicker'
import type { Task } from '@/types/hermes'
import { fetchJson } from '@/lib/api'
import type { EvidenceItem, EvidenceVerdict } from '@/lib/hermes/evidence'
import type { VerificationReading } from '@/lib/hermes/verification'

type RunInfo = {
  id: number
  profile: string
  status: string
  outcome?: string | null
  summary?: string | null
  error?: string | null
}

/** Bentuk GET /api/hermes/tasks/{id}/verification (TaskVerification di lib/hermes/kanban.ts). */
type Verification = VerificationReading & {
  readAt: string
}

/** Bentuk GET /api/hermes/tasks/{id}/evidence (TaskEvidence di lib/hermes/kanban.ts). */
type Evidence = {
  verdict: EvidenceVerdict
  items: EvidenceItem[]
  completedAt?: string
  completedAgeSeconds: number | null
  readAt: string
}

function age(sec: number | null): string {
  if (sec == null || sec < 0) return '—'
  if (sec < 60) return `${sec} s`
  if (sec < 3600) return `${Math.floor(sec / 60)} min`
  if (sec < 86400) return `${Math.floor(sec / 3600)} h`
  return `${Math.floor(sec / 86400)} d`
}

/**
 * How an origin reads in the panel.
 *
 * Returns null for anything that is not a cross-menu link. The CLI writes
 * `created_by` itself for ordinary tasks ('worker', 'user'), and showing "asal:
 * worker" on every task is noise — the line only earns its space when it names the
 * meeting or job the work came from.
 */
function originLabel(o?: { kind: string; ref?: string }): string | null {
  if (!o) return null
  switch (o.kind) {
    case 'meeting':
      return o.ref ? `reunião ${o.ref}` : 'reunião'
    case 'cron':
      return o.ref ? `cron ${o.ref}` : 'cron'
    case 'agent':
      return o.ref ? `agent ${o.ref}` : 'agent'
    default:
      return null
  }
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Ainda não começou',
  triage: 'Precisa de especificação',
  ready: 'Pronta para o worker',
  scheduled: 'Agendada',
  running: 'Em andamento',
  review: 'Aguardando revisão',
  blocked: 'Bloqueada',
  done: 'Concluída (afirmação do worker)',
  archived: 'Arquivada',
}

/**
 * Task detail panel. Opened from a card on the 3D wall board or from the 2D
 * board — including tasks that are already `done`, which is why it reads the
 * run history rather than live output only.
 */
export default function TaskPanel() {
  const taskId = useOffice((s) => s.openTaskId)
  const openTask = useOffice((s) => s.openTask)
  const tasks = useOffice((s) => s.tasks)
  const agents = useOffice((s) => s.agents)
  const load = useOffice((s) => s.load)

  const [runs, setRuns] = useState<RunInfo[]>([])
  /** The same task as `/tasks/{id}` reports it — `list` has no dependency edges. */
  const [detail, setDetail] = useState<Task | null>(null)
  const [log, setLog] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [models, setModels] = useState<ModelChoice[]>([])
  const [pick, setPick] = useState('')
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evErr, setEvErr] = useState<string | null>(null)
  const [evBusy, setEvBusy] = useState(false)
  const [evNonce, setEvNonce] = useState(0)
  const [verify, setVerify] = useState<Verification | null>(null)
  const [vfErr, setVfErr] = useState<string | null>(null)
  const [vfBusy, setVfBusy] = useState(false)

  // `detail` first: it is the only payload with `parents`.
  const task: Task | undefined = detail?.id === taskId ? detail : tasks.find((t) => t.id === taskId)
  const agent = agents.find((a) => a.name === task?.assignee)

  useEffect(() => {
    if (!taskId) return
    let alive = true
    setLoading(true)
    setErr(null)
    fetchJson<{ runs?: RunInfo[]; log?: string; task?: Task }>(`/api/hermes/tasks/${taskId}`, {
      cache: 'no-store',
    })
      .then((res) => {
        if (!alive) return
        if (!res.ok) {
          setErr(res.error || 'não foi possível carregar o detalhe da tarefa')
          return
        }
        setRuns(res.data?.runs || [])
        setLog(res.data?.log || '')
        setDetail(res.data?.task || null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [taskId])

  // Bukti hasil kerja: dibaca terpisah (show + runs + log + lampiran). Gagal = "gagal membaca
  // bukti", dan bukti task sebelumnya dibuang — tidak pernah dipajang sebagai bukti task ini.
  useEffect(() => {
    if (!taskId) return
    let alive = true
    setEvidence(null)
    setEvErr(null)
    setEvBusy(true)
    fetchJson<Evidence>(`/api/hermes/tasks/${taskId}/evidence`, { cache: 'no-store' })
      .then((res) => {
        if (!alive) return
        if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
          setEvErr(res.error || 'não foi possível ler as evidências')
          return
        }
        setEvidence(res.data)
      })
      .finally(() => alive && setEvBusy(false))
    return () => {
      alive = false
    }
  }, [taskId, evNonce])

  // Verifikasi independen: klaim worker vs review. Dibaca terpisah dari jejak events.
  // Hanya untuk done/review — task lain tidak dinilai. Gagal = "gagal membaca verifikasi",
  // dan hasil task sebelumnya dibuang — tidak pernah dipajang sebagai hasil task ini.
  useEffect(() => {
    if (!taskId) return
    let alive = true
    setVerify(null)
    setVfErr(null)
    setVfBusy(true)
    fetchJson<Verification>(`/api/hermes/tasks/${taskId}/verification`, { cache: 'no-store' })
      .then((res) => {
        if (!alive) return
        if (!res.ok || !res.data || typeof res.data.verdict !== 'string') {
          setVfErr(res.error || 'não foi possível ler a verificação')
          return
        }
        setVerify(res.data)
      })
      .finally(() => alive && setVfBusy(false))
    return () => {
      alive = false
    }
  }, [taskId])

  // The model list is config, not board state: fetched once per panel, not on the
  // poll, so opening a task does not spawn a CLI read every 4 seconds.
  useEffect(() => {
    if (!taskId || models.length) return
    let alive = true
    fetchJson<{ models?: ModelChoice[] }>('/api/hermes/models', { cache: 'no-store' }).then((res) => {
      if (alive && res.ok) setModels(res.data?.models || [])
    })
    return () => {
      alive = false
    }
  }, [taskId, models.length])

  // Show what the task is actually pinned to, not a stale pick from another task.
  useEffect(() => {
    setPick(task?.model || '')
    setNote(null)
  }, [taskId, task?.model])

  if (!taskId) return null

  /** run | promote | set-model */
  async function act(action: 'run' | 'promote' | 'set-model', extra: Record<string, unknown> = {}) {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetchJson<{ note?: string; mine?: boolean }>(
        `/api/hermes/tasks/${taskId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        },
      )
      if (!res.ok) throw new Error(res.error || 'a ação falhou')
      setNote(res.data?.note || (action === 'set-model' ? 'Modelo salvo.' : 'Concluído.'))
      await load()
      const fresh = await fetchJson<{ runs?: RunInfo[]; log?: string; task?: Task }>(
        `/api/hermes/tasks/${taskId}`,
        { cache: 'no-store' },
      )
      if (fresh.ok) {
        setRuns(fresh.data?.runs || [])
        setLog(fresh.data?.log || '')
        setDetail(fresh.data?.task || null)
      }
      setEvNonce((n) => n + 1)
    } catch (e) {
      setNote(`Gagal: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const blocked = task?.status === 'blocked' || task?.status === 'scheduled'

  return (
    <aside className="vp-panel left-0">
      <header className="vp-panel-head">
        <h2>Detalhe da tarefa</h2>
        <button className="vp-x" onClick={() => openTask(null)} aria-label="Tutup">
          ×
        </button>
      </header>

      <div className="vp-pad flex flex-col gap-3">
        {!task && <div className="vp-muted">A tarefa {taskId} não está no quadro ativo.</div>}

        {task && (
          <>
            <div className="vp-kv">
              <span>título</span>
              <b>{task.title}</b>
            </div>
            <div className="vp-kv">
              <span>status</span>
              <b>{STATUS_LABEL[task.status] || task.status}</b>
            </div>
            <div className="vp-kv">
              <span>responsável</span>
              <b>{task.assignee || '—'}{agent ? ` (${agent.role})` : ''}</b>
            </div>
            <div className="vp-kv">
              <span>prioridade</span>
              <b>{task.priority}</b>
            </div>
            <div className="vp-kv">
              <span>modelo do worker</span>
              <b>{task.model || 'padrão do perfil'}</b>
            </div>
            {task.updatedAt && (
              <div className="vp-kv">
                <span>alterado</span>
                <b>{new Date(task.updatedAt).toLocaleString('pt-BR')}</b>
              </div>
            )}
            {originLabel(task.origin) && (
              <div className="vp-kv">
                <span>origem</span>
                <b>{originLabel(task.origin)}</b>
              </div>
            )}
            <code className="vp-code-block">{task.id}</code>

            {/* The board's own dependency edge. A parent parks its subtasks: the
                dispatcher will not spawn them until every parent is `done`, and
                "menunggu prasyarat" without the ids is unactionable. */}
            {!!task.parents?.length && (
              <>
                <div className="vp-sub">PRÉ-REQUISITOS ({task.parents.length})</div>
                <div className="flex flex-col gap-1">
                  {task.parents.map((id) => {
                    const parent = tasks.find((t) => t.id === id)
                    const state = parent?.status
                    const clear = state === 'done' || state === 'archived'
                    return (
                      <button
                        key={id}
                        className="vp-run text-left"
                        onClick={() => openTask(id)}
                        title="Abrir esta tarefa"
                      >
                        <b className={clear ? '' : 'vp-warn'}>{clear ? 'concluída' : STATUS_LABEL[state || ''] || state || 'não está no quadro'}</b>
                        <span className="vp-muted"> · {parent?.title || id}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="vp-muted">
                  Esta tarefa só pode rodar depois que todos os pré-requisitos acima estiverem concluídos. O botão
                  Executar não inicia o worker enquanto algum ainda estiver pendente.
                </div>
              </>
            )}

            {/* A `ready` task is not running on its own: the dispatcher that spawns
                workers lives in the gateway. Without this button a task just sits
                there whenever the gateway is down. It lifts a parked task first,
                so one click covers blocked/scheduled too. */}
            <div className="vp-sub">EXECUTAR</div>
            <div className="flex gap-2">
              <button
                className="vp-btn"
                disabled={busy || task.status === 'running' || task.status === 'review'}
                onClick={() => act('run')}
                title="Desbloqueia se precisar e pede ao dispatcher do Hermes para executar esta tarefa"
              >
                {busy ? '…' : 'Executar'}
              </button>
            </div>
            {blocked && (
              <div className="vp-muted">
                Status <b>{task.status}</b>: o botão Executar desbloqueia antes, automaticamente.
              </div>
            )}

            <div className="vp-sub">MODELO DO AGENTE PARA ESTA TAREFA</div>
            <ModelPicker
              value={pick}
              onChange={setPick}
              models={models}
              emptyLabel={`padrão do perfil${agent ? ` (${agent.name})` : ''}`}
              disabled={busy}
              title="Vale no próximo spawn do worker"
            />
            <div className="flex gap-2">
              <button
                className="vp-btn"
                disabled={busy || pick === (task.model || '')}
                onClick={() => {
                  const hit = models.find((m) => m.model === pick)
                  void act('set-model', pick ? { model: pick, provider: hit?.provider } : { model: null })
                }}
                title="Vale no próximo spawn do worker"
              >
                Salvar modelo
              </button>
            </div>
            {note && <div className="vp-note">{note}</div>}

            {task.body && <Collapsible label="Descrição" text={task.body} />}

            {/* Klaim worker ≠ terverifikasi. "Selesai" hanya berarti worker MENYATAKAN
                selesai; terverifikasi berarti ada jejak review_requested → completed dari
                tangan kedua yang independen. Basi/gagal dibaca = dikatakan apa adanya. */}
            <div className="vp-sub">VERIFIKASI</div>
            {vfBusy && <div className="vp-muted">lendo a verificação…</div>}
            {vfErr && <div className="vp-err">não foi possível ler a verificação: {vfErr}</div>}
            {verify && (
              <>
                <div className="vp-kv">
                  <span>status</span>
                  {verify.verdict === 'verified' ? (
                    <b>
                      <span className="vp-chip">verificada</span>
                      {verify.reviewer && <span className="vp-muted"> · por {verify.reviewer}</span>}
                    </b>
                  ) : verify.verdict === 'claim' ? (
                    <b>
                      <span className="vp-chip vp-chip-warn">afirmação</span>
                      <span className="vp-muted"> · ainda sem revisão</span>
                    </b>
                  ) : task?.status === 'review' ? (
                    <b className="vp-muted">aguardando revisão{verify.reviewer ? ` por ${verify.reviewer}` : ''}</b>
                  ) : (
                    <b className="vp-muted">ainda não concluída — ainda não avaliada</b>
                  )}
                </div>
                {verify.verdict === 'claim' && <div className="vp-warn">{verify.why}</div>}
                {verify.verdict === 'verified' && verify.verifiedAt != null && (
                  <div className="vp-muted">
                    homologada em {new Date(verify.verifiedAt * 1000).toLocaleString('pt-BR')}
                    {verify.implementer ? ` · feita por ${verify.implementer}` : ''}
                  </div>
                )}
                {verify.verdict === 'open' && verify.requestedAt != null && (
                  <div className="vp-muted">
                    entregue em {new Date(verify.requestedAt * 1000).toLocaleString('pt-BR')}
                    {verify.implementer ? ` por ${verify.implementer}` : ''}
                  </div>
                )}
                <div className="vp-muted">
                  lida há {age(Math.max(0, Math.round((Date.now() - Date.parse(verify.readAt)) / 1000)))}
                </div>
              </>
            )}

            {/* "Selesai" hanya klaim worker. Yang bisa diperiksa: ringkasan, run (outcome +
                metadata), lampiran, log. Done tanpa satu pun = TANPA BUKTI, tidak pernah hijau. */}
            <div className="vp-sub">EVIDÊNCIAS</div>
            {evBusy && <div className="vp-muted">lendo as evidências…</div>}
            {evErr && <div className="vp-err">não foi possível ler as evidências: {evErr}</div>}
            {evidence && (
              <>
                <div className="vp-kv">
                  <span>avaliação</span>
                  {evidence.verdict === 'proven' ? (
                    <b>
                      <span className="vp-chip">comprovada</span>
                      {evidence.completedAgeSeconds != null && (
                        <span className="vp-muted"> · concluída há {age(evidence.completedAgeSeconds)}</span>
                      )}
                    </b>
                  ) : evidence.verdict === 'unproven' ? (
                    <b>
                      <span className="vp-chip vp-chip-warn">SEM EVIDÊNCIA</span>
                    </b>
                  ) : (
                    <b className="vp-muted">ainda não concluída — ainda não avaliada</b>
                  )}
                </div>
                {evidence.verdict === 'unproven' && (
                  <div className="vp-warn">
                    Marcada como concluída, mas não há resumo, execução com metadados, log nem anexo
                    que dê para conferir.
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {evidence.items
                    .filter((it) => it.kind === 'summary' || it.kind === 'run')
                    .map((it, i) => (
                      <Collapsible key={`${it.kind}-${i}`} label={it.label} text={it.body || ''} />
                    ))}
                  {evidence.items.some((it) => it.kind === 'attachment') && (
                    <div className="vp-run">
                      <b>anexos</b>
                      {evidence.items
                        .filter((it) => it.kind === 'attachment')
                        .map((it, i) => (
                          <div key={i} className="vp-muted">{it.label}</div>
                        ))}
                      <div className="vp-muted">A CLI só lista os anexos; o conteúdo não abre daqui.</div>
                    </div>
                  )}
                  {evidence.items.some((it) => it.kind === 'log') && (
                    <div className="vp-muted">há log do worker — veja “Log do worker” abaixo.</div>
                  )}
                  {!evidence.items.length && <div className="vp-muted">não há evidência nas quatro fontes</div>}
                </div>
                <div className="vp-muted">
                  lida há {age(Math.max(0, Math.round((Date.now() - Date.parse(evidence.readAt)) / 1000)))}
                </div>
              </>
            )}

            <div className="vp-sub">HISTÓRICO DE EXECUÇÕES ({runs.length})</div>
            {loading && <div className="vp-muted">carregando…</div>}
            {err && <div className="vp-err">{err}</div>}
            <div className="flex flex-col gap-2">
              {runs
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.id} className="vp-run">
                    <b>{r.status}</b>
                    {r.outcome ? <span> · {r.outcome}</span> : null}
                    {r.profile ? <span className="vp-muted"> · {r.profile}</span> : null}
                    {r.summary && <div className="vp-muted">{r.summary}</div>}
                    {r.error && <div className="vp-err">{r.error}</div>}
                  </div>
                ))}
              {!loading && !runs.length && <div className="vp-muted">ainda não há execuções</div>}
            </div>

            <Collapsible
              label="Log do worker"
              text={log}
              count={log.trim() ? log.trim().split('\n').length : undefined}
              empty="ainda não há log"
            />
          </>
        )}
      </div>
    </aside>
  )
}
