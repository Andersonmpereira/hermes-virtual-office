/**
 * Sessão, senha, origem HTTPS e cobertura das rotas.
 * Não fala com o Hermes e não grava segredo em log.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { authConfigured } from '../src/lib/auth/config'
import { attemptLogin, resetLoginAttempts } from '../src/lib/auth/login'
import { hashPassword } from '../src/lib/auth/password'
import { requireSession } from '../src/lib/auth/require-session'
import {
  clearSessionCookieHeader,
  createSessionToken,
  readSessionToken,
  sessionCookieHeader,
  SESSION_COOKIE,
} from '../src/lib/auth/session'
import { localOriginAllowed } from '../src/lib/local-guard'

let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`)
}

const hash = hashPassword('correta-senha')
process.env.OFFICE_USERNAME = 'operador'
process.env.OFFICE_PASSWORD_HASH = hash
process.env.OFFICE_SESSION_SECRET = 'x'.repeat(40)
process.env.ALLOWED_ORIGINS = 'agents.damadanoitearomas.com'
resetLoginAttempts()

check('auth configurada', authConfigured())

const good = attemptLogin('operador', 'correta-senha')
check('login válido', good.ok === true)
const badUser = attemptLogin('outro', 'correta-senha')
const badPass = attemptLogin('operador', 'errada')
check('usuário inválido rejeitado', badUser.ok === false)
check('senha inválida rejeitada', badPass.ok === false)

const token = good.ok ? good.token : ''
check('token de sessão', readSessionToken(token)?.username === 'operador')
check('token adulterado rejeitado', readSessionToken(`${token}x`) === null)

const setCookie = sessionCookieHeader(token, true)
check('cookie HttpOnly', /HttpOnly/i.test(setCookie))
check('cookie Secure em produção', /Secure/i.test(setCookie))
check('cookie SameSite=Lax', /SameSite=Lax/i.test(setCookie))
check('cookie não é a senha', !setCookie.includes('correta-senha'))
const devCookie = sessionCookieHeader(token, false)
check('cookie sem Secure fora de produção', !/Secure/i.test(devCookie))
check('logout limpa o cookie', /Max-Age=0/.test(clearSessionCookieHeader(true)))

function req(method: string, cookie: string | null, origin: string | null, host = 'agents.damadanoitearomas.com') {
  const headers = new Headers()
  headers.set('host', host)
  if (cookie) headers.set('cookie', `${SESSION_COOKIE}=${cookie}`)
  if (origin) headers.set('origin', origin)
  return new Request(`https://${host}/api/hermes/tasks`, { method, headers })
}

const noSession = requireSession(req('GET', null, null))
check('GET sem sessão é 401', noSession?.status === 401)

const readOk = requireSession(req('GET', token, 'https://agents.damadanoitearomas.com'))
check('GET autenticado segue', readOk === null)

const writeNoSession = requireSession(req('POST', null, 'https://agents.damadanoitearomas.com'))
check('POST sem sessão é 401', writeNoSession?.status === 401)

const writeHttps = requireSession(req('POST', token, 'https://agents.damadanoitearomas.com'))
check('POST https da origem legítima segue', writeHttps === null)

const writeEvil = requireSession(req('POST', token, 'https://evil.example'))
check('POST de origem estranha é 403', writeEvil?.status === 403)

const writeMissingOrigin = requireSession(req('POST', token, null))
check('POST sem Origin é 403', writeMissingOrigin?.status === 403)

check(
  'https do domínio público é aceito pelo guard',
  localOriginAllowed('agents.damadanoitearomas.com', 'https://agents.damadanoitearomas.com'),
)
check(
  'origem arbitrária continua recusada',
  localOriginAllowed('evil.example', 'https://evil.example') === false,
)

delete process.env.OFFICE_SESSION_SECRET
check('sem segredo a sessão não abre', createSessionToken('operador') === null)
check('sem segredo o GET responde 503', requireSession(req('GET', token, null))?.status === 503)
process.env.OFFICE_SESSION_SECRET = 'x'.repeat(40)

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (name === 'route.ts') acc.push(p)
  }
  return acc
}

const hermesRoutes = walk(path.join('src', 'app', 'api', 'hermes'))
const missing = hermesRoutes.filter((file) => !readFileSync(file, 'utf8').includes('requireSession(req)'))
check('todas as rotas Hermes exigem sessão', missing.length === 0, missing.join(', '))

const health = readFileSync(path.join('src', 'app', 'api', 'health', 'route.ts'), 'utf8')
check('health não exige sessão', !health.includes('requireSession'))
check('health não revela configuração', !/OFFICE_|HERMES_|password|token/i.test(health))

const loginRoute = readFileSync(path.join('src', 'app', 'api', 'auth', 'login', 'route.ts'), 'utf8')
check('login não registra o corpo', !/console\.(log|info|debug|warn|error)/.test(loginRoute))

const office = readFileSync(path.join('src', 'components', 'OfficeApp.tsx'), 'utf8')
const loginForm = readFileSync(path.join('src', 'app', 'login', 'login-form.tsx'), 'utf8')
const kanban = readFileSync(path.join('src', 'components', 'KanbanColumns.tsx'), 'utf8')
const layout = readFileSync(path.join('src', 'app', 'layout.tsx'), 'utf8')
const taskDialog = readFileSync(path.join('src', 'components', 'NewTaskDialog.tsx'), 'utf8')
check('barra tem Sair', office.includes('Sair'))
check('barra tem Reunião', office.includes('Reunião'))
check('login em português', loginForm.includes('Entrar') && loginForm.includes('Senha'))
check('kanban em português', kanban.includes('CONCLUÍDO') && kanban.includes('EM ANDAMENTO'))
check('idioma do documento é pt-BR', layout.includes('lang="pt-BR"'))
check('nova tarefa em português', taskDialog.includes('Nova tarefa') && taskDialog.includes('Enviar para a fila'))

const kanbanSrc = readFileSync(path.join('src', 'lib', 'hermes', 'kanban.ts'), 'utf8')
check('CLI continua sendo o hermes', /HERMES_BIN/.test(kanbanSrc) && /execFile/.test(kanbanSrc))

console.log(failed ? `\n${failed} falha(s)` : '\ntodos os checks de auth passaram')
process.exit(failed ? 1 : 0)
