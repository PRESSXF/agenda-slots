import { AgendaError } from './errors'
import { DAY_MS, MINUTE, formatDate, formatTime, parseDate, parseTime, type PlainDate, type PlainTime } from './time'

/**
 * Fuso horário só com `Intl`. A única pergunta que o motor faz ao fuso é:
 * "qual é o deslocamento em relação ao UTC neste instante?". O resto é aritmética.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      throw new AgendaError('INVALID_TIME_ZONE', `Fuso horário desconhecido: "${timeZone}". Use um nome IANA, como America/Recife.`)
    }
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone)
    return true
  } catch {
    return false
  }
}

export interface ZonedParts {
  date: PlainDate
  /** Minutos desde a meia-noite local. */
  minutes: number
  time: PlainTime
  second: number
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** Deslocamento lido direto do `Intl` (lento: um `formatToParts` por chamada). */
function rawOffset(epochMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return wall - Math.floor(epochMs / 1000) * 1000
}

const HOUR = 3_600_000
const MAX_CACHE = 20_000
const offsetCache = new Map<string, Map<number, number | null>>()

/**
 * Deslocamento do fuso em relação ao UTC, em milissegundos (Recife: -3 h = -10 800 000).
 *
 * Cache por hora cheia: se o deslocamento é igual no começo e no fim da hora, ele vale para a
 * hora inteira (não existem duas trocas na mesma hora). Horas com troca ficam marcadas e são
 * calculadas instante a instante. Isso tira o `Intl` do caminho quente do motor.
 */
export function getTimeZoneOffset(epochMs: number, timeZone: string): number {
  let cache = offsetCache.get(timeZone)
  if (!cache) {
    formatterFor(timeZone)
    cache = new Map()
    offsetCache.set(timeZone, cache)
  }
  const bucket = Math.floor(epochMs / HOUR)
  let cached = cache.get(bucket)
  if (cached === undefined) {
    const a = rawOffset(bucket * HOUR, timeZone)
    const b = rawOffset(bucket * HOUR + HOUR - 1000, timeZone)
    cached = a === b ? a : null
    if (cache.size >= MAX_CACHE) cache.clear()
    cache.set(bucket, cached)
  }
  return cached ?? rawOffset(epochMs, timeZone)
}

/** Data e hora de parede de um instante num fuso. */
export function getZonedParts(epochMs: number, timeZone: string): ZonedParts {
  const wall = new Date(Math.floor(epochMs / 1000) * 1000 + getTimeZoneOffset(epochMs, timeZone))
  const year = wall.getUTCFullYear()
  const month = wall.getUTCMonth() + 1
  const day = wall.getUTCDate()
  const hour = wall.getUTCHours()
  const minute = wall.getUTCMinutes()
  const second = wall.getUTCSeconds()
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: formatDate(year, month, day),
    minutes: hour * 60 + minute,
    time: formatTime(hour * 60 + minute),
  }
}

/**
 * Converte data e hora de parede num instante (ms desde a época).
 *
 * Segue a regra "compatible" do Temporal:
 * - hora que acontece duas vezes (fim do horário de verão): usa a primeira;
 * - hora que não existe (início do horário de verão): avança pelo tamanho do salto,
 *   então 00:30 de um dia em que o relógio pula de 00:00 para 01:00 vira 01:30.
 */
export function zonedTimeToEpoch(date: PlainDate, time: PlainTime | number, timeZone: string): number {
  const { year, month, day } = parseDate(date)
  const minutes = typeof time === 'number' ? time : parseTime(time)
  const wall = Date.UTC(year, month - 1, day) + minutes * MINUTE
  const before = getTimeZoneOffset(wall - DAY_MS, timeZone)
  const after = getTimeZoneOffset(wall + DAY_MS, timeZone)
  const valid: number[] = []
  for (const offset of before === after ? [before] : [before, after]) {
    const instant = wall - offset
    if (getTimeZoneOffset(instant, timeZone) === offset) valid.push(instant)
  }
  if (valid.length > 0) return Math.min(...valid)
  // Hora inexistente: aplica o deslocamento de antes do salto.
  return wall - before
}

function formatOffset(offsetMs: number): string {
  if (offsetMs === 0) return 'Z'
  const sign = offsetMs < 0 ? '-' : '+'
  const total = Math.abs(Math.round(offsetMs / MINUTE))
  return `${sign}${formatTime(total)}`
}

/** ISO 8601 com o deslocamento local, por exemplo `2026-11-16T08:00:00-03:00`. */
export function formatInstant(epochMs: number, timeZone: string): string {
  const p = getZonedParts(epochMs, timeZone)
  const offset = getTimeZoneOffset(epochMs, timeZone)
  return `${p.date}T${p.time}:${String(p.second).padStart(2, '0')}${formatOffset(offset)}`
}

/** Data local de hoje (ou do instante informado) no fuso. */
export function todayIn(timeZone: string, now: number = Date.now()): PlainDate {
  return getZonedParts(now, timeZone).date
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/

/** Data e hora sem fuso (`2026-11-16T08:00`) são lidas no fuso da agenda. */
export type InstantInput = string | number | Date

/**
 * Lê um instante. Aceita número (ms), `Date`, ISO com deslocamento (`...-03:00` ou `...Z`)
 * e ISO sem deslocamento, que é interpretado no fuso da agenda (nunca no fuso da máquina).
 */
export function toEpoch(value: InstantInput, timeZone: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new AgendaError('INVALID_INSTANT', 'Instante inválido.')
    return value
  }
  if (value instanceof Date) {
    const t = value.getTime()
    if (Number.isNaN(t)) throw new AgendaError('INVALID_INSTANT', 'Data inválida.')
    return t
  }
  if (LOCAL_RE.test(value)) {
    const [date, rest] = value.split('T') as [string, string]
    const [hh, mm, ss = '0'] = rest.split(':') as [string, string, string?]
    const base = zonedTimeToEpoch(date, `${hh}:${mm}`, timeZone)
    return base + Math.round(Number(ss) * 1000)
  }
  const t = Date.parse(value)
  if (Number.isNaN(t)) throw new AgendaError('INVALID_INSTANT', `Instante inválido: "${value}".`)
  return t
}
