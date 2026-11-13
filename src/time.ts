import { AgendaError } from './errors'

/** Data civil no formato `AAAA-MM-DD`, sem fuso. */
export type PlainDate = string

/** Hora civil no formato `HH:MM` (24 h). `24:00` é aceito como fim do dia. */
export type PlainTime = string

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = (typeof WEEKDAYS)[number]

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})$/

export const MINUTE = 60_000
export const DAY_MS = 86_400_000

/** Converte `HH:MM` em minutos desde a meia-noite. */
export function parseTime(time: PlainTime): number {
  const m = TIME_RE.exec(time)
  if (!m) throw new AgendaError('INVALID_TIME', `Hora inválida: "${time}". Use HH:MM.`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) {
    throw new AgendaError('INVALID_TIME', `Hora fora do intervalo: "${time}".`)
  }
  return h * 60 + min
}

/** Minutos desde a meia-noite para `HH:MM`. */
export function formatTime(minutes: number): PlainTime {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface DateParts {
  year: number
  month: number
  day: number
}

export function parseDate(date: PlainDate): DateParts {
  const m = DATE_RE.exec(date)
  if (!m) throw new AgendaError('INVALID_DATE', `Data inválida: "${date}". Use AAAA-MM-DD.`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new AgendaError('INVALID_DATE', `Data inexistente: "${date}".`)
  }
  return { year, month, day }
}

export function formatDate(year: number, month: number, day: number): PlainDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Dias corridos a partir da época para uma data civil (aritmética de calendário, sem fuso). */
function toEpochDay(date: PlainDate): number {
  const { year, month, day } = parseDate(date)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

function fromEpochDay(n: number): PlainDate {
  const d = new Date(n * DAY_MS)
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromEpochDay(toEpochDay(date) + days)
}

/** `b - a` em dias. */
export function diffDays(a: PlainDate, b: PlainDate): number {
  return toEpochDay(b) - toEpochDay(a)
}

export function weekdayOf(date: PlainDate): Weekday {
  const n = new Date(toEpochDay(date) * DAY_MS).getUTCDay()
  return WEEKDAYS[n]!
}

/** Lista de datas de `from` até `to`, inclusive. */
export function dateRange(from: PlainDate, to: PlainDate): PlainDate[] {
  const n = diffDays(from, to)
  if (n < 0) throw new AgendaError('INVALID_RANGE', `A data final (${to}) é anterior à inicial (${from}).`)
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i))
}

export function isPlainDate(value: unknown): value is PlainDate {
  return typeof value === 'string' && DATE_RE.test(value)
}
