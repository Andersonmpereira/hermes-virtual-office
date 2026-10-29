import { NextResponse } from 'next/server'

/**
 * Write guard for the office's mutating endpoints.
 *
 * WHY THIS FILE EXISTS: every action that changes something — kill, spawn, hide,
 * create a task, send a chat, start a meeting, rename the office — goes through
 * here. The office is normally opened at its PUBLIC address, but this guard once
 * allowed only loopback names, so every write from a real browser was answered
 * 403. Reads worked, which is exactly why the app looked alive but felt dead:
 * nothing you clicked did anything.
 *
 * TWO checks, and both are needed:
 *
 *   1. SAME-ORIGIN. The `Origin` header must name the very host being requested.
 *      This is the CSRF defence: a page on evil.example sends
 *      `Origin: http://evil.example`, which can never equal our `Host`.
 *
 *   2. A TRUSTED HOST. That host must be loopback or explicitly listed in
 *      `ALLOWED_ORIGINS`. This is the DNS-rebinding defence: an attacker who
 *      points evil.example at our IP gets `Host` and `Origin` to agree, but
 *      evil.example is not on the list.
 *
 * WHAT THIS DOES **NOT** DO: it does not authenticate anyone. A person who opens
 * the office URL in a browser IS same-origin, so they can write. Session auth
 * lives in requireSession. This guard only stops cross-site writes.
 *
 * http and https are both accepted when the host matches and is trusted.
 * An arbitrary public origin is still refused.
 */

/** Loopback names, always trusted. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Extra hosts allowed to write, from `ALLOWED_ORIGINS` in `.env.local`.
 *
 * Comma-separated `host[:port]` entries; a scheme prefix is tolerated so an
 * operator can paste a full origin. Example:
 *
 *   ALLOWED_ORIGINS=203.0.113.10:3300,office.example.com
 */
function configuredHosts(): string[] {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
}

/** Strip a trailing `:port`, leaving the bare host (handles `[::1]:3000`). */
function bareHost(host: string): string {
  return host.replace(/:\d+$/, '')
}

/**
 * Porta explícita 443 no Host (proxy) equivale à porta omitida de um Origin https.
 * O mesmo vale para http e a porta 80.
 */
function samePort(host: URL, origin: URL): boolean {
  if (host.port === origin.port) return true
  if (origin.protocol === 'https:' && origin.port === '' && host.port === '443') return true
  if (origin.protocol === 'http:' && origin.port === '' && host.port === '80') return true
  return false
}

function trustedHost(host: string): boolean {
  if (LOOPBACK.has(bareHost(host))) return true
  const bare = bareHost(host)
  return configuredHosts().some((entry) => entry === host || entry === bare)
}

export function localOriginAllowed(hostHeader: string | null, originHeader: string | null): boolean {
  if (!hostHeader || !originHeader) return false

  try {
    const host = new URL(`http://${hostHeader}`)
    const origin = new URL(originHeader)
    // 1. same-origin: the Origin names the host being requested
    if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return false
    if (origin.hostname.toLowerCase() !== host.hostname.toLowerCase()) return false
    if (!samePort(host, origin)) return false
    // 2. and that host is one we trust
    return trustedHost(host.host)
  } catch {
    return false
  }
}

export function assertLocalWriteRequest(req: Request): NextResponse | null {
  const host = req.headers.get('host')
  const origin = req.headers.get('origin')
  if (localOriginAllowed(host, origin)) return null
  // The message names the fix, because a silent 403 here is indistinguishable
  // from a broken button — which is precisely how this bug hid for so long.
  return NextResponse.json(
    {
      error: {
        code: 'forbidden_origin',
        message:
          'Origem não permitida para alterar dados. Abra o painel pelo endereço listado em ALLOWED_ORIGINS.',
        status: 403,
      },
    },
    { status: 403 },
  )
}
