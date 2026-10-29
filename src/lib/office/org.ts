/**
 * Departamentos da Dama da Noite Aromas.
 *
 * A planta continua com as salas e as mesas que já existem (`exec`, `tech`,
 * `growth`, `content`). Este arquivo só dá nome a essas salas e diz em qual
 * delas um agente senta. A identidade Hermes (SOUL.md, perfil, tarefas) não
 * é gravada aqui.
 *
 * Para incluir um departamento: acrescente um item apontando para uma `roomId`
 * que já está em `layout.ts`. `division: null` significa que a ala não tem
 * mesa própria — o agente continua na divisão Hermes e usa uma mesa livre.
 */
import type { AgentDivision } from '@/types/hermes'

export const OFFICE_BRAND = 'Dama da Noite Aromas'

export type OrgDepartmentId = 'diretoria' | 'shopee' | 'mercadolivre' | 'tiktok' | 'inteligencia'

export type OrgDepartment = {
  id: OrgDepartmentId
  label: string
  /** Texto da placa na parede. Curto de propósito: a placa mede 1,9 m. */
  plaque: string
  roomId: string
  /** Mesas já construídas. null = ala identificável, sem estação própria. */
  division: AgentDivision | null
  desks: number
  note: string
}

export const ORG_DEPARTMENTS: readonly OrgDepartment[] = [
  {
    id: 'diretoria',
    label: 'Diretoria',
    plaque: 'DIRETORIA',
    roomId: 'ceo',
    division: 'exec',
    desks: 1,
    note: 'Coordenação, prioridades e resultados. Usa a sala e a mesa da diretoria.',
  },
  {
    id: 'shopee',
    label: 'Shopee',
    plaque: 'SHOPEE',
    roomId: 'dev',
    division: 'tech',
    desks: 3,
    note: 'Conta, métricas, anúncios e catálogo. Três mesas na ala oeste.',
  },
  {
    id: 'mercadolivre',
    label: 'Mercado Livre',
    plaque: 'MERCADO LIVRE',
    roomId: 'mkt',
    division: 'growth',
    desks: 3,
    note: 'Marketplace, anúncios e desempenho. Três mesas na ala oeste.',
  },
  {
    id: 'tiktok',
    label: 'TikTok Shop',
    plaque: 'TIKTOK SHOP',
    roomId: 'content',
    division: 'content',
    desks: 3,
    note: 'Produtos, conteúdo e conversão. Três mesas na ala oeste.',
  },
  {
    id: 'inteligencia',
    label: 'Inteligência e Automação',
    plaque: 'INTELIGÊNCIA',
    roomId: 'leisure',
    division: null,
    desks: 0,
    note: 'Análises, automações e monitoramento. A ala está identificada; não há mesa própria, então o agente senta na primeira mesa livre.',
  },
]

/** Placas das salas de reunião. Os ids internos (merapi, rinjani, …) não mudam. */
const MEETING_PLAQUES: Record<string, string> = {
  rinjani: 'SALA DE REUNIÕES',
  merapi: 'PLANEJAMENTO',
  bromo: 'REUNIÃO SHOPEE',
  semeru: 'REUNIÃO ML',
  cikurai: 'REUNIÃO TIKTOK',
  pantry: 'COPA',
}

const BY_ID = new Map(ORG_DEPARTMENTS.map((d) => [d.id, d]))

export function isOrgDepartment(id: string): id is OrgDepartmentId {
  return BY_ID.has(id as OrgDepartmentId)
}

export function departmentById(id: string): OrgDepartment | undefined {
  return BY_ID.get(id as OrgDepartmentId)
}

/** Divisão geométrica das mesas. null quando o departamento não tem mesa própria. */
export function divisionForDepartment(id: string): AgentDivision | null {
  return departmentById(id)?.division ?? null
}

/**
 * Onde o agente senta. A associação do escritório vence a divisão do SOUL
 * quando o departamento tem mesas. Sem associação, ou sem mesas, fica a divisão
 * que o Hermes já declarou.
 */
export function seatDivision(soul: AgentDivision, orgId: string | null): AgentDivision {
  if (!orgId) return soul
  return divisionForDepartment(orgId) ?? soul
}

export function plaqueForRoom(roomId: string): string | null {
  const dept = ORG_DEPARTMENTS.find((d) => d.roomId === roomId)
  if (dept) return dept.plaque
  return MEETING_PLAQUES[roomId] ?? null
}

/** Rótulos só para status que o Hermes realmente devolve. */
export const AGENT_STATUS_LABEL: Record<string, string> = {
  idle: 'ocioso',
  working: 'ocupado',
  review: 'em revisão',
  blocked: 'indisponível',
  meeting: 'em reunião',
  done: 'concluído',
}
