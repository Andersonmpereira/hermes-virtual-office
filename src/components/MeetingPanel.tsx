'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import Collapsible from './Collapsible'
import FullPanel from './FullPanel'
import ActionItems, { type Candidate } from './ActionItems'
import { fetchJson } from '@/lib/api'

/**
 * Meeting room.
 *
 * Two screens: a LIST of meeting cards and the CREATE form.
 *
 * Every meeting is a CARD, including the one running right now. Nothing expands
 * inline — a live meeting used to render its whole transcript straight into the
 * list, so the list was dominated by the newest meeting and the older ones were
 * pushed off screen. A card opens on click, live or archived.
 */
export default function MeetingPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const agents = useOffice((s) => s.agents)
  const meeting = useOffice((s) => s.meeting)
  const configured = useOffice((s) => s.meetingConfigured)
  const history = useOffice((s) => s.meetingHistory)
  const refresh = useOffice((s) => s.refreshMeeting)

  const [screen, setScreen] = useState<'list' | 'new'>('list')
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [moderator, setModerator] = useState('')
  const [meetingMode, setMeetingMode] = useState<'simulasi' | 'a2a'>('simulasi')
  const [busy, setBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /**
   * Which card is open. A live meeting reads from its in-memory record; an
   * archived one is fetched by id. `kind` decides which.
   */
  const [opened, setOpened] = useState<{ kind: 'live' | 'archive'; id: string } | null>(null)
  const [archive, setArchive] = useState<{ id: string; body: string } | null>(null)
  const [archBusy, setArchBusy] = useState(false)

  /**
   * Follow-up items parsed from the open meeting's minutes, offered as tasks.
   * Loaded per opened meeting, including archived ones — a follow-up from last
   * week's meeting is exactly the thing that still needs doing.
   */
  const [items, setItems] = useState<Candidate[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [itemsBusy, setItemsBusy] = useState(false)

  // Load the follow-ups whenever an open card has minutes to read from. A meeting
  // that is still running has none yet, so this fires on completion.
  const openId = opened?.id || ''
  const minutesReady = opened
    ? opened.kind === 'live'
      ? !!meeting?.minutes
      : !!archive?.body
    : false
  useEffect(() => {
    if (!openId || !minutesReady) {
      setItems([])
      return
    }
    let alive = true
    setItemsBusy(true)
    fetchJson<{ items?: Candidate[]; roster?: string[] }>(
      `/api/hermes/meeting/actions?from=${encodeURIComponent(openId)}`,
      { cache: 'no-store' },
    )
      .then((res) => {
        if (!alive) return
        // A meeting with no follow-ups is a normal outcome, not an error: the panel
        // simply shows nothing to convert.
        setItems(res.ok ? res.data?.items || [] : [])
        setRoster(res.data?.roster || [])
      })
      .finally(() => alive && setItemsBusy(false))
    return () => {
      alive = false
    }
  }, [openId, minutesReady])

  if (!open) return null

  const live = meeting && (meeting.state === 'queued' || meeting.state === 'running')

  const toggle = (name: string) => {
    setPicked((p) => {
      if (p.includes(name)) {
        const next = p.filter((x) => x !== name)
        if (moderator === name) setModerator(next[0] || '')
        return next
      }
      if (p.length >= 4) return p
      const next = [...p, name]
      if (!moderator) setModerator(name)
      return next
    })
  }

  async function start() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetchJson('/api/hermes/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, participants: picked, moderator, mode: meetingMode }),
      })
      if (!res.ok) throw new Error(res.error || 'não foi possível iniciar a reunião')
      await refresh()
      setTopic('')
      setPicked([])
      setModerator('')
      setScreen('list')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openArchive(id: string) {
    setArchBusy(true)
    setErr(null)
    setOpened({ kind: 'archive', id })
    setArchive(null)
    try {
      const res = await fetchJson<{ id: string; body: string }>(
        `/api/hermes/meeting?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      )
      if (!res.ok || !res.data) throw new Error(res.error || 'não foi possível abrir a transcrição')
      setArchive({ id: res.data.id, body: res.data.body })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setArchBusy(false)
    }
  }

  function closeCard() {
    setOpened(null)
    setArchive(null)
  }

  /**
   * Batalkan rapat yang sedang berjalan (RAPAT-CANCEL-1). Tombolnya hanya
   * dirender saat `live` — tak ada rapat berjalan = tak ada tombol, tak ada
   * sukses palsu. Arsip DIBATALKAN ditulis runner di batas giliran; refresh
   * berkala mengambil status terbaru.
   */
  async function cancel() {
    if (!meeting) return
    setCancelBusy(true)
    setErr(null)
    try {
      const res = await fetchJson<{ already_cancelled?: boolean; cancel_requested?: boolean }>(
        '/api/hermes/meeting/cancel',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: meeting.id }),
        },
      )
      if (!res.ok) throw new Error(res.error || 'não foi possível cancelar a reunião')
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setCancelBusy(false)
    }
  }

  function download(name: string, text: string) {
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  /** One card in the list. */
  function Card({
    title,
    meta,
    highlight,
    onClick,
    disabled,
  }: {
    title: string
    meta: string
    highlight?: boolean
    onClick: () => void
    disabled?: boolean
  }) {
    return (
      <button
        className={`vp-meeting-row ${highlight ? 'on' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <b>{title}</b>
        <i>{meta}</i>
      </button>
    )
  }

  return (
    <FullPanel
      onClose={onClose}
      label="Sala de reunião"
      title={screen === 'new' ? 'Nova reunião' : 'Sala de reunião'}
      actions={
        screen === 'new' && (
          <button className="vp-chip-btn" onClick={() => setScreen('list')}>
            ← Voltar
          </button>
        )
      }
      bodyClassName="vp-pad flex flex-col gap-3"
    >
      {err && <div className="vp-err">{err}</div>}

      {screen === 'list' ? (
        opened ? (
          /* ------------------------------------------------ opened card ---- */
          <>
            <button className="vp-chip-btn" onClick={closeCard}>
              ← Lista de reuniões
            </button>

            {opened.kind === 'archive' ? (
              archBusy || !archive ? (
                <div className="vp-muted">carregando a transcrição…</div>
              ) : (
                <>
                  <Collapsible
                    label={`Transcrição · ${archive.id}`}
                    text={archive.body}
                    defaultOpen
                  />
                  <button
                    className="vp-btn vp-btn-ghost"
                    onClick={() => download(`rapat-${archive.id}.md`, archive.body)}
                  >
                    Baixar
                  </button>

                  {itemsBusy ? (
                    <div className="vp-muted">lendo os encaminhamentos…</div>
                  ) : (
                    <ActionItems
                      candidates={items}
                      roster={roster}
                      origin={{ kind: 'meeting', ref: archive.id }}
                      label="ENCAMINHAMENTOS → TAREFAS"
                    />
                  )}
                </>
              )
            ) : !meeting ? (
              <div className="vp-muted">esta reunião não está mais na memória</div>
            ) : (
              <>
                <div className="vp-kv">
                  <span>tópico</span>
                  <b>{meeting.topic || '(sem tópico)'}</b>
                </div>
                <div className="vp-kv">
                  <span>status</span>
                  <b>
                    {meeting.state} · {meeting.phase}
                    {live && <span className="vp-live"> ●</span>}
                  </b>
                </div>
                <div className="vp-kv">
                  <span>mode</span>
                  <b>
                    {meeting.mode === 'a2a'
                      ? 'A2A — falas de agentes reais via A2A'
                      : 'simulação — quem fala é o LLM do gateway, NÃO é um agente'}
                  </b>
                </div>
                <div className="vp-kv">
                  <span>participantes</span>
                  <b>{meeting.participants.join(', ') || '—'}</b>
                </div>
                <div className="vp-kv">
                  <span>turno</span>
                  <b>{meeting.currentSpeaker || '—'}</b>
                </div>

                {live && (
                  <button
                    className="vp-btn vp-btn-warn"
                    disabled={cancelBusy}
                    onClick={cancel}
                  >
                    {cancelBusy ? 'Cancelando…' : 'Cancelar reunião'}
                  </button>
                )}

                <Collapsible
                  label="Transcrição"
                  count={meeting.turns.length}
                  defaultOpen={!!live}
                  empty="ainda não há turnos"
                >
                  <div className="flex flex-col gap-2">
                    {meeting.turns.map((t, i) => (
                      <div
                        key={i}
                        className={`vp-turn ${
                          t.speaker === meeting.currentSpeaker && live ? 'talk' : ''
                        }`}
                      >
                        <div className="vp-turn-who">
                          {t.speaker}
                          <i>
                            {t.kind}
                            {t.round ? ` · r${t.round}` : ''}
                          </i>
                        </div>
                        <div className="vp-turn-body">{t.text}</div>
                      </div>
                    ))}
                  </div>
                </Collapsible>

                {meeting.minutes && (
                  <>
                    <Collapsible label="Ata" text={meeting.minutes} defaultOpen />
                    <button
                      className="vp-btn vp-btn-ghost"
                      onClick={() => download(`ata-${meeting.id}.md`, meeting.minutes)}
                    >
                      Baixar ata
                    </button>

                    {/* The cross-menu link: what this meeting asked for, as tasks. */}
                    {itemsBusy ? (
                      <div className="vp-muted">lendo os encaminhamentos…</div>
                    ) : (
                      <ActionItems
                        candidates={items}
                        roster={roster}
                        origin={{ kind: 'meeting', ref: meeting.id }}
                        label="ENCAMINHAMENTOS → TAREFAS"
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          /* ------------------------------------------------ the list ------ */
          <>
            <button className="vp-btn" onClick={() => setScreen('new')}>
              + Nova reunião
            </button>
            {!configured && (
              <div className="vp-note">
                O LLM ainda não está configurado — a reunião não pode começar. Preencha{' '}
                <code>AI_BASE_URL</code> dan <code>AI_API_KEY</code> di{' '}
                <code>.env.local</code>.
              </div>
            )}

            {meeting && (
              <>
                <div className="vp-sub">
                  REUNIÃO ATIVA {live && <span className="vp-live">●</span>}
                </div>
                <Card
                  title={meeting.topic || '(sem tópico)'}
                  meta={`${meeting.state} · ${meeting.participants.length} participantes · ${meeting.turns.length} turnos`}
                  highlight={!!live}
                  onClick={() => setOpened({ kind: 'live', id: meeting.id })}
                />
              </>
            )}

            <div className="vp-sub">REUNIÕES ANTERIORES ({history.length})</div>
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <Card
                  key={h.id}
                  title={h.topic}
                  meta={`${h.startedAt} · ${h.participants.length || '?'} participantes · ${h.turnCount} turnos`}
                  disabled={archBusy}
                  onClick={() => openArchive(h.id)}
                />
              ))}
              {!history.length && (
                <span className="vp-muted">ainda não há reuniões salvas</span>
              )}
            </div>
          </>
        )
      ) : (
        /* ---------------------------------------------------- create form -- */
        <>
          <label className="vp-sub">TÓPICO</label>
          <textarea
            className="vp-input"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Rencana rilis endpoint refund"
          />

          <label className="vp-sub">PARTICIPANTES (2–4) · {agents.length} agentes ativos</label>
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <button
                key={a.name}
                className={`vp-chip-btn ${picked.includes(a.name) ? 'on' : ''}`}
                onClick={() => toggle(a.name)}
              >
                {a.displayName}
                <i className="vp-chip-role">{a.status}</i>
              </button>
            ))}
            {!agents.length && <span className="vp-muted">ainda não há agentes ativos</span>}
          </div>

          <label className="vp-sub">MEDIADOR</label>
          <select
            className="vp-input"
            value={moderator}
            onChange={(e) => setModerator(e.target.value)}
          >
            {picked.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <label className="vp-sub">MODO DA REUNIÃO</label>
          <div className="flex flex-col gap-2">
            <label className="vp-kv">
              <input
                type="radio"
                name="meeting-mode"
                checked={meetingMode === 'simulasi'}
                onChange={() => setMeetingMode('simulasi')}
              />
              <span>
                <b>Simulação</b> — quem fala é o LLM do gateway, <b>não</b> o agente. É o
                comportamento antigo, com o rótulo honesto.
              </span>
            </label>
            <label className="vp-kv">
              <input
                type="radio"
                name="meeting-mode"
                checked={meetingMode === 'a2a'}
                onChange={() => setMeetingMode('a2a')}
              />
              <span>
                <b>A2A</b> — quem fala é o agente real pelo protocolo A2A (é preciso ligar o
                A2A de cada participante e reiniciar o gateway depois da mudança).
              </span>
            </label>
          </div>

          <button
            className="vp-btn"
            disabled={busy || !topic.trim() || picked.length < 2 || !configured}
            onClick={start}
          >
            {busy ? 'Iniciando…' : 'Iniciar reunião'}
          </button>
          {picked.length < 2 && <div className="vp-muted">escolha pelo menos 2 participantes</div>}
        </>
      )}
    </FullPanel>
  )
}
