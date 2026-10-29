'use client'

import { useState } from 'react'

export default function LoginForm({ unconfigured }: { unconfigured: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (unconfigured || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        let message = 'Não foi possível entrar.'
        try {
          const body = (await res.json()) as { error?: { message?: string } }
          if (body.error?.message) message = body.error.message
        } catch {
          message = 'Não foi possível entrar.'
        }
        setError(message)
        return
      }
      const next = new URLSearchParams(window.location.search).get('next')
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
      window.location.assign(dest)
    } catch {
      setError('Não foi possível contatar o servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0f1418] px-4 text-slate-100">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm rounded-lg border border-white/10 bg-[#171d22] p-6">
        <h1 className="text-lg font-semibold">Dama da Noite Aromas</h1>
        <p className="mt-1 text-sm text-slate-400">Entre para abrir o escritório virtual.</p>
        {unconfigured ? (
          <p className="mt-4 text-sm text-amber-300" role="alert">
            Autenticação do painel não configurada.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-sm">
              Usuário
              <input
                className="mt-1 w-full rounded border border-white/10 bg-black/30 px-3 py-2"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="mt-3 block text-sm">
              Senha
              <input
                className="mt-1 w-full rounded border border-white/10 bg-black/30 px-3 py-2"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="mt-3 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <button className="vp-btn primary mt-4 w-full" type="submit" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </>
        )}
      </form>
    </main>
  )
}
