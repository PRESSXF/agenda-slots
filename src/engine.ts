import { AgendaError } from './errors'
import type { Holiday } from './holidays'
import { IntervalIndex, contains, maxConcurrency, mergeIntervals, type Interval } from './interval'
import { REASON_LABELS } from './reasons'
import {
  MINUTE,
  WEEKDAYS,
  addDays,
  dateRange,
  diffDays,
  parseDate,
  parseTime,
  weekdayOf,
  type PlainDate,
  type Weekday,
} from './time'
import { formatInstant, getZonedParts, isValidTimeZone, toEpoch, zonedTimeToEpoch } from './timezone'
import type {
  AgendaConfig,
  Alignment,
  DayAvailability,
  ExplainedTime,
  Reason,
  ReasonCode,
  Slot,
  SlotQuery,
  TimeRangeInput,
} from './types'

export const DEFAULT_TIME_ZONE = 'America/Recife'
export const DEFAULTS = {
  timeZone: DEFAULT_TIME_ZONE,
  stepMinutes: 15,
  minNoticeMinutes: 0,
  maxDaysAhead: 60,
  alignment: 'hours' as Alignment,
}

// ---------------------------------------------------------------------------
// Estruturas compiladas
// ---------------------------------------------------------------------------

type MinuteRange = readonly [number, number]

interface CService {
  id: string
  name: string
  durationMinutes: number
  duration: number
  before: number
  after: number
  resourceIds: string[]
  capacity: number
}

interface CProfessional {
  id: string
  name: string
  weekly: Record<Weekday, MinuteRange[]>
  exceptions: Map<PlainDate, { ranges: MinuteRange[]; reason?: string }>
  serviceIds: Set<string> | null
  /** Primeiro e último minuto em que a pessoa trabalha em qualquer dia (janela da grade explicada). */
  window: MinuteRange | null
}

interface CBooking {
  id: string
  professionalId: string
  serviceId?: string
  label: string
  startMs: number
  endMs: number
  seats: number
  resourceIds: string[]
  /** Chave da sessão: agendamentos da mesma turma no mesmo horário dividem os recursos. */
  sessionKey: string
}

interface Block extends Interval {
  booking: CBooking
  buffered: boolean
}

interface ResourceUse extends Interval {
  key: string
  booking?: CBooking
  reason?: string
}

export interface Compiled {
  timeZone: string
  stepMinutes: number
  minNoticeMinutes: number
  maxDaysAhead: number
  alignment: Alignment
  services: Map<string, CService>
  professionals: Map<string, CProfessional>
  resources: Map<string, { id: string; name: string; capacity: number }>
  holidays: Map<PlainDate, Holiday>
  bookings: CBooking[]
  byProfessional: Map<string, IntervalIndex<Block>>
  byResource: Map<string, IntervalIndex<ResourceUse>>
}

// ---------------------------------------------------------------------------
// Validação e compilação
// ---------------------------------------------------------------------------

function positiveInt(value: unknown, name: string, min = 1): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new AgendaError('INVALID_OPTION', `${name} precisa ser um inteiro maior ou igual a ${min}. Recebido: ${String(value)}.`)
  }
  return value
}

function parseRange(input: TimeRangeInput, where: string): MinuteRange {
  let start: string
  let end: string
  if (typeof input === 'string') {
    const parts = input.split('-').map((s) => s.trim())
    if (parts.length !== 2) throw new AgendaError('INVALID_TIME', `Faixa inválida em ${where}: "${input}". Use "08:00-12:00".`)
    start = parts[0]!
    end = parts[1]!
  } else {
    start = input.start
    end = input.end
  }
  const s = parseTime(start)
  const e = parseTime(end)
  if (e <= s) {
    throw new AgendaError('INVALID_RANGE', `Faixa ${start}-${end} em ${where} termina antes de começar. Faixas que cruzam a meia-noite devem ser divididas em duas datas.`)
  }
  return [s, e]
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  return mergeIntervals(ranges.map(([start, end]) => ({ start, end }))).map((i) => [i.start, i.end] as const)
}

export function compile(config: AgendaConfig): Compiled {
  const timeZone = config.timeZone ?? DEFAULTS.timeZone
  if (!isValidTimeZone(timeZone)) {
    throw new AgendaError('INVALID_TIME_ZONE', `Fuso horário desconhecido: "${timeZone}". Use um nome IANA, como America/Recife.`)
  }
  const stepMinutes = positiveInt(config.stepMinutes ?? DEFAULTS.stepMinutes, 'stepMinutes')
  const minNoticeMinutes = positiveInt(config.minNoticeMinutes ?? DEFAULTS.minNoticeMinutes, 'minNoticeMinutes', 0)
  const maxDaysAhead = positiveInt(config.maxDaysAhead ?? DEFAULTS.maxDaysAhead, 'maxDaysAhead', 0)
  const alignment = config.alignment ?? DEFAULTS.alignment
  if (alignment !== 'hours' && alignment !== 'clock') {
    throw new AgendaError('INVALID_OPTION', `alignment precisa ser "hours" ou "clock".`)
  }

  const resources = new Map<string, { id: string; name: string; capacity: number }>()
  for (const r of config.resources ?? []) {
    resources.set(r.id, { id: r.id, name: r.name ?? r.id, capacity: positiveInt(r.capacity ?? 1, `capacity do recurso ${r.id}`) })
  }

  const services = new Map<string, CService>()
  for (const s of config.services) {
    const durationMinutes = positiveInt(s.durationMinutes, `durationMinutes do serviço ${s.id}`)
    const before = positiveInt(s.bufferBeforeMinutes ?? 0, `bufferBeforeMinutes do serviço ${s.id}`, 0)
    const after = positiveInt(s.bufferAfterMinutes ?? 0, `bufferAfterMinutes do serviço ${s.id}`, 0)
    for (const rid of s.resourceIds ?? []) {
      if (!resources.has(rid)) throw new AgendaError('UNKNOWN_RESOURCE', `O serviço ${s.id} usa o recurso "${rid}", que não foi cadastrado.`)
    }
    services.set(s.id, {
      id: s.id,
      name: s.name ?? s.id,
      durationMinutes,
      duration: durationMinutes * MINUTE,
      before: before * MINUTE,
      after: after * MINUTE,
      resourceIds: [...new Set(s.resourceIds ?? [])],
      capacity: positiveInt(s.capacity ?? 1, `capacity do serviço ${s.id}`),
    })
  }

  const professionals = new Map<string, CProfessional>()
  for (const p of config.professionals) {
    const weekly = {} as Record<Weekday, MinuteRange[]>
    let lo = Infinity
    let hi = -Infinity
    const track = (ranges: MinuteRange[]) => {
      for (const [s, e] of ranges) {
        lo = Math.min(lo, s)
        hi = Math.max(hi, e)
      }
    }
    for (const day of WEEKDAYS) {
      weekly[day] = mergeRanges((p.weeklyHours[day] ?? []).map((r) => parseRange(r, `${p.id}.${day}`)))
      track(weekly[day])
    }
    const exceptions = new Map<PlainDate, { ranges: MinuteRange[]; reason?: string }>()
    for (const ex of p.exceptions ?? []) {
      parseDate(ex.date)
      const ranges = mergeRanges(ex.hours.map((r) => parseRange(r, `${p.id} em ${ex.date}`)))
      track(ranges)
      exceptions.set(ex.date, ex.reason === undefined ? { ranges } : { ranges, reason: ex.reason })
    }
    for (const sid of p.serviceIds ?? []) {
      if (!services.has(sid)) throw new AgendaError('UNKNOWN_SERVICE', `${p.id} atende "${sid}", que não foi cadastrado.`)
    }
    professionals.set(p.id, {
      id: p.id,
      name: p.name ?? p.id,
      weekly,
      exceptions,
      serviceIds: p.serviceIds ? new Set(p.serviceIds) : null,
      window: lo < hi ? [lo, hi] : null,
    })
  }

  const holidays = new Map<PlainDate, Holiday>()
  for (const h of config.holidays ?? []) {
    const holiday: Holiday = typeof h === 'string' ? { date: h, name: 'Feriado' } : h
    parseDate(holiday.date)
    holidays.set(holiday.date, holiday)
  }

  const bookings: CBooking[] = []
  const blocks = new Map<string, Block[]>()
  const uses = new Map<string, ResourceUse[]>()
  for (const id of resources.keys()) uses.set(id, [])
  for (const id of professionals.keys()) blocks.set(id, [])

  for (const r of config.resources ?? []) {
    for (const [i, b] of (r.blocked ?? []).entries()) {
      const start = toEpoch(b.start, timeZone)
      const end = toEpoch(b.end, timeZone)
      if (end <= start) throw new AgendaError('INVALID_RANGE', `Bloqueio ${i + 1} do recurso ${r.id} termina antes de começar.`)
      uses.get(r.id)!.push({ start, end, key: `block:${r.id}:${i}`, reason: b.reason ?? 'bloqueado' })
    }
  }

  for (const b of config.bookings ?? []) {
    if (!professionals.has(b.professionalId)) {
      throw new AgendaError('UNKNOWN_PROFESSIONAL', `O agendamento ${b.id} é de "${b.professionalId}", que não foi cadastrado.`)
    }
    const service = b.serviceId === undefined ? undefined : services.get(b.serviceId)
    if (b.serviceId !== undefined && !service) {
      throw new AgendaError('UNKNOWN_SERVICE', `O agendamento ${b.id} usa o serviço "${b.serviceId}", que não foi cadastrado.`)
    }
    const startMs = toEpoch(b.start, timeZone)
    let endMs: number
    if (b.end !== undefined) endMs = toEpoch(b.end, timeZone)
    else if (service) endMs = startMs + service.duration
    else throw new AgendaError('INVALID_RANGE', `O agendamento ${b.id} precisa de "end" ou de "serviceId".`)
    if (endMs <= startMs) throw new AgendaError('INVALID_RANGE', `O agendamento ${b.id} termina antes de começar.`)
    const resourceIds = [...new Set(b.resourceIds ?? service?.resourceIds ?? [])]
    for (const rid of resourceIds) {
      if (!resources.has(rid)) throw new AgendaError('UNKNOWN_RESOURCE', `O agendamento ${b.id} usa o recurso "${rid}", que não foi cadastrado.`)
    }
    const isGroup = !!service && service.capacity > 1
    const booking: CBooking = {
      id: b.id,
      professionalId: b.professionalId,
      ...(b.serviceId === undefined ? {} : { serviceId: b.serviceId }),
      label: b.label ?? service?.name ?? b.id,
      startMs,
      endMs,
      seats: positiveInt(b.seats ?? 1, `seats do agendamento ${b.id}`),
      resourceIds,
      sessionKey: isGroup ? `session:${b.professionalId}:${b.serviceId}:${startMs}` : `booking:${b.id}`,
    }
    bookings.push(booking)
    const before = service?.before ?? 0
    const after = service?.after ?? 0
    const interval = { start: startMs - before, end: endMs + after }
    blocks.get(b.professionalId)!.push({ ...interval, booking, buffered: before + after > 0 })
    for (const rid of resourceIds) uses.get(rid)!.push({ ...interval, key: booking.sessionKey, booking })
  }

  const byProfessional = new Map<string, IntervalIndex<Block>>()
  for (const [id, list] of blocks) byProfessional.set(id, new IntervalIndex(list))
  const byResource = new Map<string, IntervalIndex<ResourceUse>>()
  for (const [id, list] of uses) byResource.set(id, new IntervalIndex(list))

  return {
    timeZone,
    stepMinutes,
    minNoticeMinutes,
    maxDaysAhead,
    alignment,
    services,
    professionals,
    resources,
    holidays,
    bookings,
    byProfessional,
    byResource,
  }
}

// ---------------------------------------------------------------------------
// Expediente de um dia
// ---------------------------------------------------------------------------

export interface DayPlan {
  date: PlainDate
  weekday: Weekday
  /** Faixas do expediente como instantes, já fundidas. */
  work: Interval[]
  holiday?: Holiday
  exception?: { ranges: MinuteRange[]; reason?: string }
}

export function planDay(c: Compiled, p: CProfessional, date: PlainDate): DayPlan {
  const weekday = weekdayOf(date)
  const exception = p.exceptions.get(date)
  const holiday = c.holidays.get(date)
  const ranges = exception ? exception.ranges : holiday ? [] : p.weekly[weekday]
  const work = ranges.map(([s, e]) => ({
    start: zonedTimeToEpoch(date, s, c.timeZone),
    end: zonedTimeToEpoch(date, e, c.timeZone),
  }))
  return {
    date,
    weekday,
    work: mergeIntervals(work),
    ...(holiday ? { holiday } : {}),
    ...(exception ? { exception } : {}),
  }
}

// ---------------------------------------------------------------------------
// Avaliação de um horário
// ---------------------------------------------------------------------------

function reason(code: ReasonCode, detail: string, extra: Partial<Reason> = {}): Reason {
  return { code, label: REASON_LABELS[code], detail, ...extra }
}

export function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return minutes === 1440 ? '24 h' : `${minutes / 1440} dias`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function shortDate(date: PlainDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

function rangesText(c: Compiled, work: Interval[]): string {
  const parts = work.map((w) => `${localTime(c, w.start)} às ${localTime(c, w.end)}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

function localTime(c: Compiled, ms: number): string {
  return getZonedParts(ms, c.timeZone).time
}

export interface EvalContext {
  now: number
  today: PlainDate
}

export interface Evaluation {
  reasons: Reason[]
  remaining?: number
}

/** Todos os motivos pelos quais `startMs` não serve para o serviço com esse profissional. */
export function evaluate(
  c: Compiled,
  p: CProfessional,
  s: CService,
  plan: DayPlan,
  startMs: number,
  ctx: EvalContext,
): Evaluation {
  const reasons: Reason[] = []
  const endMs = startMs + s.duration

  // 1. Tempo: passado, antecedência e limite de dias.
  if (startMs < ctx.now) {
    reasons.push(reason('past', 'Este horário já passou.'))
  } else if (startMs < ctx.now + c.minNoticeMinutes * MINUTE) {
    const earliest = ctx.now + c.minNoticeMinutes * MINUTE
    const p2 = getZonedParts(earliest, c.timeZone)
    reasons.push(
      reason('min_notice', `Exige ${formatDuration(c.minNoticeMinutes)} de antecedência: marcações a partir de ${shortDate(p2.date)} às ${p2.time}.`),
    )
  }
  if (diffDays(ctx.today, plan.date) > c.maxDaysAhead) {
    reasons.push(
      reason('beyond_max_days', `A agenda abre só até ${c.maxDaysAhead} dias à frente (até ${shortDate(addDays(ctx.today, c.maxDaysAhead))}).`),
    )
  }

  // 2. O profissional atende esse serviço?
  if (p.serviceIds && !p.serviceIds.has(s.id)) {
    reasons.push(reason('service_not_offered', `${p.name} não atende ${s.name}.`))
  }

  // 3. Expediente.
  if (plan.work.length === 0) {
    if (plan.exception) {
      reasons.push(reason('day_off', plan.exception.reason ? `Folga: ${plan.exception.reason}.` : 'Folga cadastrada para esta data.'))
    } else if (plan.holiday) {
      reasons.push(reason('holiday', `Feriado: ${plan.holiday.name}.`, { holiday: plan.holiday.name }))
    } else {
      reasons.push(reason('outside_hours', 'Sem expediente neste dia da semana.'))
    }
  } else if (!plan.work.some((w) => contains(w, { start: startMs, end: endMs }))) {
    reasons.push(
      reason(
        'outside_hours',
        `O atendimento de ${formatDuration(s.durationMinutes)}, das ${localTime(c, startMs)} às ${localTime(c, endMs)}, não cabe no expediente (${rangesText(c, plan.work)}).`,
      ),
    )
  }

  // 4. Agenda do profissional, com os intervalos de preparo e limpeza.
  const need = { start: startMs - s.before, end: endMs + s.after }
  const isGroup = s.capacity > 1
  const isSeat = (b: CBooking) => isGroup && b.serviceId === s.id && b.startMs === startMs && b.professionalId === p.id
  const blocks = c.byProfessional.get(p.id)!.query(need.start, need.end)
  const conflicts = blocks.filter((b) => !isSeat(b.booking))
  if (conflicts.length > 0) {
    const first = conflicts[0]!
    const buffered = s.before + s.after > 0 || conflicts.some((b) => b.buffered)
    const more = conflicts.length > 1 ? ` e mais ${conflicts.length - 1}` : ''
    reasons.push(
      reason(
        'booking_conflict',
        `Choca com ${first.booking.label} (${localTime(c, first.booking.startMs)} às ${localTime(c, first.booking.endMs)})${more}${buffered ? ', contando os intervalos de preparo e limpeza' : ''}.`,
        { bookingIds: conflicts.map((b) => b.booking.id) },
      ),
    )
  }

  // 5. Vagas da turma.
  let remaining: number | undefined
  if (isGroup) {
    const taken = blocks.filter((b) => isSeat(b.booking)).reduce((n, b) => n + b.booking.seats, 0)
    remaining = Math.max(0, s.capacity - taken)
    if (remaining === 0) reasons.push(reason('full', `As ${s.capacity} vagas da turma já estão ocupadas.`))
  }

  // 6. Recursos (sala, aparelho). Agendamentos do próprio profissional já viraram conflito acima.
  for (const rid of s.resourceIds) {
    const resource = c.resources.get(rid)!
    const ownSession = `session:${p.id}:${s.id}:${startMs}`
    const seen = new Set<string>()
    const users = c.byResource
      .get(rid)!
      .query(need.start, need.end)
      .filter((u) => {
        if (u.key === ownSession || seen.has(u.key)) return false
        if (u.booking && u.booking.professionalId === p.id) return false
        seen.add(u.key)
        return true
      })
    if (users.length === 0) continue
    if (maxConcurrency(users, need) < resource.capacity) continue
    const u = users[0]!
    const what = u.booking
      ? `em uso por ${u.booking.label} (${localTime(c, u.booking.startMs)} às ${localTime(c, u.booking.endMs)})`
      : `${u.reason} (${localTime(c, u.start)} às ${localTime(c, u.end)})`
    const detail =
      resource.capacity > 1
        ? `${resource.name}: todas as ${resource.capacity} unidades em uso nesse horário.`
        : `${resource.name} ${what}.`
    reasons.push(reason('resource_busy', detail, { resourceId: rid, ...(u.booking ? { bookingIds: users.flatMap((x) => (x.booking ? [x.booking.id] : [])) } : {}) }))
  }

  return remaining === undefined ? { reasons } : { reasons, remaining }
}

// ---------------------------------------------------------------------------
// Grade de horários e consulta principal
// ---------------------------------------------------------------------------

/** Inícios candidatos de um dia, alinhados ao passo. */
export function candidateStarts(c: Compiled, s: CService, plan: DayPlan): number[] {
  const step = c.stepMinutes * MINUTE
  const out: number[] = []
  const base = c.alignment === 'clock' ? zonedTimeToEpoch(plan.date, 0, c.timeZone) : 0
  for (const w of plan.work) {
    let t = c.alignment === 'clock' ? base + Math.ceil((w.start - base) / step) * step : w.start
    for (; t + s.duration <= w.end; t += step) out.push(t)
  }
  return out
}

export function makeSlot(c: Compiled, p: CProfessional, s: CService, date: PlainDate, startMs: number, remaining?: number): Slot {
  const endMs = startMs + s.duration
  return {
    professionalId: p.id,
    serviceId: s.id,
    date,
    time: localTime(c, startMs),
    endTime: localTime(c, endMs),
    start: formatInstant(startMs, c.timeZone),
    end: formatInstant(endMs, c.timeZone),
    startMs,
    endMs,
    ...(remaining === undefined ? {} : { remaining }),
  }
}

export function getService(c: Compiled, id: string): CService {
  const s = c.services.get(id)
  if (!s) throw new AgendaError('UNKNOWN_SERVICE', `Serviço desconhecido: "${id}".`)
  return s
}

export function getProfessional(c: Compiled, id: string): CProfessional {
  const p = c.professionals.get(id)
  if (!p) throw new AgendaError('UNKNOWN_PROFESSIONAL', `Profissional desconhecido: "${id}".`)
  return p
}

/** Profissionais pedidos, ou todos que atendem o serviço. */
export function pickProfessionals(c: Compiled, s: CService, ids?: string[]): CProfessional[] {
  if (ids) return ids.map((id) => getProfessional(c, id))
  return [...c.professionals.values()].filter((p) => !p.serviceIds || p.serviceIds.has(s.id))
}

export function context(c: Compiled, now: SlotQuery['now']): EvalContext {
  const nowMs = now === undefined ? Date.now() : toEpoch(now, c.timeZone)
  return { now: nowMs, today: getZonedParts(nowMs, c.timeZone).date }
}

export function resolveDates(from: PlainDate, to?: PlainDate, days?: number): PlainDate[] {
  if (to !== undefined) return dateRange(from, to)
  const n = positiveInt(days ?? 1, 'days')
  return dateRange(from, addDays(from, n - 1))
}

/** Slots de um profissional num dia (sem a grade explicada). */
export function daySlots(c: Compiled, p: CProfessional, s: CService, plan: DayPlan, ctx: EvalContext): Slot[] {
  const slots: Slot[] = []
  for (const t of candidateStarts(c, s, plan)) {
    const ev = evaluate(c, p, s, plan, t, ctx)
    if (ev.reasons.length === 0) slots.push(makeSlot(c, p, s, plan.date, t, ev.remaining))
  }
  return slots
}

function explainDay(
  c: Compiled,
  p: CProfessional,
  s: CService,
  plan: DayPlan,
  ctx: EvalContext,
  slots: Slot[],
  window?: SlotQuery['explainWindow'],
): ExplainedTime[] {
  const [ws, we] = window
    ? [parseTime(window.start), parseTime(window.end)]
    : (p.window ?? [8 * 60, 18 * 60])
  const step = c.stepMinutes * MINUTE
  const startMs = zonedTimeToEpoch(plan.date, ws, c.timeZone)
  const endMs = zonedTimeToEpoch(plan.date, we, c.timeZone)
  const times = new Set<number>()
  const slotStarts = new Set(slots.map((x) => x.startMs))
  for (let t = startMs; t < endMs; t += step) times.add(t)
  for (const slot of slots) if (slot.startMs >= startMs && slot.startMs < endMs) times.add(slot.startMs)
  return [...times]
    .sort((a, b) => a - b)
    .map((t) => {
      const ev = evaluate(c, p, s, plan, t, ctx)
      if (ev.reasons.length === 0 && !slotStarts.has(t)) {
        // Cabe, mas não está na grade (expediente que começa fora do múltiplo do passo).
        ev.reasons.push(reason('off_step', `Os horários começam a cada ${c.stepMinutes} min a partir ${c.alignment === 'clock' ? 'da meia-noite' : 'do início do expediente'}.`))
      }
      return {
        professionalId: p.id,
        date: plan.date,
        time: localTime(c, t),
        start: formatInstant(t, c.timeZone),
        startMs: t,
        endMs: t + s.duration,
        available: ev.reasons.length === 0,
        reasons: ev.reasons,
        ...(ev.remaining === undefined ? {} : { remaining: ev.remaining }),
      }
    })
}

/**
 * Horários livres por dia e por profissional.
 *
 * Para cada dia: monta o expediente como instantes no fuso da agenda, gera os inícios
 * alinhados ao passo e testa cada um contra agenda, recursos, vagas e regras de tempo.
 */
export function slotsFromCompiled(c: Compiled, query: SlotQuery): DayAvailability[] {
  const s = getService(c, query.serviceId)
  const ctx = context(c, query.now)
  const dates = resolveDates(query.from ?? ctx.today, query.to, query.days)
  const pros = pickProfessionals(c, s, query.professionalIds)
  const out: DayAvailability[] = []
  for (const date of dates) {
    for (const p of pros) {
      const plan = planDay(c, p, date)
      const slots = daySlots(c, p, s, plan, ctx)
      const day: DayAvailability = {
        date,
        weekday: plan.weekday,
        professionalId: p.id,
        slots,
        closed: plan.work.length === 0,
        ...(plan.holiday ? { holiday: plan.holiday } : {}),
      }
      if (query.explain) day.explained = explainDay(c, p, s, plan, ctx, slots, query.explainWindow)
      out.push(day)
    }
  }
  return out
}

export function getAvailableSlots(config: AgendaConfig, query: SlotQuery): DayAvailability[] {
  return slotsFromCompiled(compile(config), query)
}

/** Junta os slots de todos os dias e profissionais em ordem de início. */
export function flattenSlots(days: DayAvailability[]): Slot[] {
  return days.flatMap((d) => d.slots).sort((a, b) => a.startMs - b.startMs)
}
