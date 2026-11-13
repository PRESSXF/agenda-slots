import { AgendaError } from './errors'
import { REASON_LABELS } from './reasons'
import {
  candidateStarts,
  compile,
  context,
  daySlots,
  evaluate,
  getProfessional,
  getService,
  makeSlot,
  pickProfessionals,
  planDay,
  type Compiled,
} from './engine'
import { addDays, diffDays } from './time'
import { getZonedParts, toEpoch, type InstantInput } from './timezone'
import type { AgendaConfig, CheckResult, Slot } from './types'

export interface NextAvailableQuery {
  serviceId: string
  professionalIds?: string[]
  /** Procura a partir deste instante. Padrão: `now`. */
  after?: InstantInput
  now?: InstantInput
  /** Quantos dias olhar no máximo. Padrão: até o limite `maxDaysAhead` da agenda. */
  searchDays?: number
}

/**
 * Primeiro horário livre a partir de `after`, entre os profissionais pedidos.
 * Para no primeiro dia com vaga, então custa um dia de cálculo na maioria dos casos.
 */
export function nextAvailableFromCompiled(c: Compiled, q: NextAvailableQuery): Slot | null {
  const s = getService(c, q.serviceId)
  const ctx = context(c, q.now)
  const afterMs = Math.max(q.after === undefined ? ctx.now : toEpoch(q.after, c.timeZone), ctx.now)
  const startDate = getZonedParts(afterMs, c.timeZone).date
  const lastDate = addDays(ctx.today, c.maxDaysAhead)
  const span = Math.min(diffDays(startDate, lastDate), q.searchDays === undefined ? Infinity : q.searchDays - 1)
  const pros = pickProfessionals(c, s, q.professionalIds)
  for (let i = 0; i <= span; i++) {
    const date = addDays(startDate, i)
    let best: Slot | null = null
    for (const p of pros) {
      const found = daySlots(c, p, s, planDay(c, p, date), ctx).find((slot) => slot.startMs >= afterMs)
      if (found && (!best || found.startMs < best.startMs)) best = found
    }
    if (best) return best
  }
  return null
}

export function findNextAvailable(config: AgendaConfig, q: NextAvailableQuery): Slot | null {
  return nextAvailableFromCompiled(compile(config), q)
}

export interface SuggestQuery {
  serviceId: string
  /** Horário pedido pelo cliente. */
  at: InstantInput
  professionalIds?: string[]
  now?: InstantInput
  /** Quantas sugestões devolver. Padrão: 3. */
  limit?: number
  /** Dias antes e depois do pedido em que procurar. Padrão: 3. */
  rangeDays?: number
}

/**
 * Horários livres mais próximos do pedido, antes ou depois, ordenados pela distância.
 * Empates ficam com o mais cedo. Se o próprio horário pedido estiver livre, ele vem primeiro.
 */
export function suggestFromCompiled(c: Compiled, q: SuggestQuery): Slot[] {
  const s = getService(c, q.serviceId)
  const ctx = context(c, q.now)
  const atMs = toEpoch(q.at, c.timeZone)
  const limit = q.limit ?? 3
  const range = q.rangeDays ?? 3
  if (!Number.isInteger(limit) || limit < 1) throw new AgendaError('INVALID_OPTION', 'limit precisa ser um inteiro maior que zero.')
  if (!Number.isInteger(range) || range < 0) throw new AgendaError('INVALID_OPTION', 'rangeDays precisa ser um inteiro maior ou igual a zero.')
  const center = getZonedParts(atMs, c.timeZone).date
  const pros = pickProfessionals(c, s, q.professionalIds)
  const all: Slot[] = []
  for (let i = -range; i <= range; i++) {
    const date = addDays(center, i)
    if (diffDays(ctx.today, date) < 0) continue
    for (const p of pros) all.push(...daySlots(c, p, s, planDay(c, p, date), ctx))
  }
  const order = new Map(pros.map((p, i) => [p.id, i]))
  return all
    .sort(
      (a, b) =>
        Math.abs(a.startMs - atMs) - Math.abs(b.startMs - atMs) ||
        a.startMs - b.startMs ||
        order.get(a.professionalId)! - order.get(b.professionalId)!,
    )
    .slice(0, limit)
}

export function suggestAlternatives(config: AgendaConfig, q: SuggestQuery): Slot[] {
  return suggestFromCompiled(compile(config), q)
}

export interface CheckQuery {
  serviceId: string
  professionalId: string
  start: InstantInput
  now?: InstantInput
  /** Exige que o início caia na grade do passo. Padrão: `false`. */
  requireStep?: boolean
}

/**
 * Confere um agendamento antes de gravar: devolve `ok` e todos os motivos de recusa.
 * Use no back-end para não confiar no horário que veio da tela.
 */
export function checkFromCompiled(c: Compiled, q: CheckQuery): CheckResult {
  const s = getService(c, q.serviceId)
  const p = getProfessional(c, q.professionalId)
  const ctx = context(c, q.now)
  const startMs = toEpoch(q.start, c.timeZone)
  const date = getZonedParts(startMs, c.timeZone).date
  const plan = planDay(c, p, date)
  const ev = evaluate(c, p, s, plan, startMs, ctx)
  const reasons = [...ev.reasons]
  if (q.requireStep && plan.work.length > 0 && !reasons.some((r) => r.code === 'outside_hours')) {
    // Dentro do expediente, o início precisa ser um dos candidatos da grade.
    if (!candidateStarts(c, s, plan).includes(startMs)) {
      reasons.push({
        code: 'off_step',
        label: REASON_LABELS.off_step,
        detail: `Os horários começam a cada ${c.stepMinutes} min.`,
      })
    }
  }
  return { ok: reasons.length === 0, reasons, slot: makeSlot(c, p, s, date, startMs, ev.remaining) }
}

export function checkBooking(config: AgendaConfig, q: CheckQuery): CheckResult {
  return checkFromCompiled(compile(config), q)
}
