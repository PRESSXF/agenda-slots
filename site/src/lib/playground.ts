import {
  addDays,
  brazilianHolidaysBetween,
  createAgenda,
  formatTime,
  toEpoch,
  type AgendaConfig,
  type Booking,
  type DayAvailability,
  type Professional,
  type Service,
  type Slot,
  type WeeklyHours,
} from 'agenda-slots'
import { DAYS, INITIAL_BOOKINGS, NOW, PROFESSIONALS, RESOURCES, SERVICES, TIME_ZONE, type HoursState } from '../clinic'

export interface ServiceTuning {
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
}

export interface PlaygroundState {
  proId: string
  serviceId: string
  weekStart: string
  stepMinutes: number
  minNoticeMinutes: number
  holidays: boolean
  hours: Record<string, HoursState>
  tuning: Record<string, ServiceTuning>
  daysOff: Record<string, string[]>
  bookings: Booking[]
}

export function initialState(): PlaygroundState {
  return {
    proId: 'helena',
    serviceId: 'fisio',
    weekStart: '2026-11-16',
    stepMinutes: 15,
    minNoticeMinutes: 120,
    holidays: true,
    hours: Object.fromEntries(PROFESSIONALS.map((p) => [p.id, structuredClone(p.hours)])),
    tuning: Object.fromEntries(
      SERVICES.map((s) => [
        s.id,
        {
          durationMinutes: s.durationMinutes,
          bufferBeforeMinutes: s.bufferBeforeMinutes ?? 0,
          bufferAfterMinutes: s.bufferAfterMinutes ?? 0,
        },
      ]),
    ),
    daysOff: {},
    bookings: INITIAL_BOOKINGS,
  }
}

export function toWeeklyHours(hours: HoursState): WeeklyHours {
  const out: WeeklyHours = {}
  for (const d of DAYS) {
    const day = hours[d.id]
    if (day.on && day.ranges.length > 0) out[d.id] = day.ranges.map(([s, e]) => `${formatTime(s)}-${formatTime(e)}`)
  }
  return out
}

export function buildServices(state: PlaygroundState): Service[] {
  return SERVICES.map((s) => {
    const t = state.tuning[s.id]!
    const out: Service = { ...s, durationMinutes: t.durationMinutes }
    if (t.bufferBeforeMinutes > 0) out.bufferBeforeMinutes = t.bufferBeforeMinutes
    else delete out.bufferBeforeMinutes
    if (t.bufferAfterMinutes > 0) out.bufferAfterMinutes = t.bufferAfterMinutes
    else delete out.bufferAfterMinutes
    return out
  })
}

export function buildConfig(state: PlaygroundState): AgendaConfig {
  const professionals: Professional[] = PROFESSIONALS.map((p) => {
    const off = state.daysOff[p.id] ?? []
    return {
      id: p.id,
      name: p.name,
      serviceIds: p.serviceIds,
      weeklyHours: toWeeklyHours(state.hours[p.id]!),
      ...(off.length ? { exceptions: off.map((date) => ({ date, hours: [], reason: 'folga marcada no playground' })) } : {}),
    }
  })
  const year = Number(state.weekStart.slice(0, 4))
  return {
    timeZone: TIME_ZONE,
    stepMinutes: state.stepMinutes,
    minNoticeMinutes: state.minNoticeMinutes,
    maxDaysAhead: 60,
    holidays: state.holidays ? brazilianHolidaysBetween(year, year + 1) : [],
    professionals,
    services: buildServices(state),
    resources: RESOURCES,
    bookings: state.bookings,
  }
}

/** Janela de linhas da grade: do primeiro ao último horário da semana da profissional. */
export function gridWindow(hours: HoursState): { start: string; end: string } {
  let lo = Infinity
  let hi = -Infinity
  for (const d of DAYS) {
    const day = hours[d.id]
    if (!day.on) continue
    for (const [s, e] of day.ranges) {
      lo = Math.min(lo, s)
      hi = Math.max(hi, e)
    }
  }
  if (!Number.isFinite(lo)) return { start: '08:00', end: '18:00' }
  return { start: formatTime(Math.floor(lo / 60) * 60), end: formatTime(Math.min(1440, Math.ceil(hi / 60) * 60)) }
}

export interface Computed {
  days: DayAvailability[]
  next: Slot | null
  ms: number
  error?: string
  bookingSpans: Array<{ booking: Booking; startMs: number; endMs: number }>
  config: AgendaConfig
}

export function compute(state: PlaygroundState): Computed {
  const config = buildConfig(state)
  const t0 = performance.now()
  try {
    const agenda = createAgenda(config)
    const days = agenda.slots({
      serviceId: state.serviceId,
      professionalIds: [state.proId],
      from: state.weekStart,
      days: 7,
      now: NOW,
      explain: true,
      explainWindow: gridWindow(state.hours[state.proId]!),
    })
    const next = agenda.nextAvailable({ serviceId: state.serviceId, professionalIds: [state.proId], now: NOW })
    const ms = performance.now() - t0
    const services = new Map(config.services.map((s) => [s.id, s]))
    const bookingSpans = state.bookings
      .filter((b) => b.professionalId === state.proId)
      .map((b) => {
        const startMs = toEpoch(b.start, TIME_ZONE)
        const dur = services.get(b.serviceId!)!.durationMinutes
        return { booking: b, startMs, endMs: startMs + dur * 60_000 }
      })
    return { days, next, ms, bookingSpans, config }
  } catch (e) {
    return { days: [], next: null, ms: 0, error: (e as Error).message, bookingSpans: [], config }
  }
}

export function suggestFor(state: PlaygroundState, at: number): Slot[] {
  try {
    return createAgenda(buildConfig(state)).suggest({
      serviceId: state.serviceId,
      professionalIds: [state.proId],
      at,
      now: NOW,
      limit: 3,
    })
  } catch {
    return []
  }
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export const formatShortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`
