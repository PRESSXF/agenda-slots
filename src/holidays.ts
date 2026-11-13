import { AgendaError } from './errors'
import { addDays, formatDate, type PlainDate } from './time'

export interface Holiday {
  date: PlainDate
  name: string
  /** `fixed`: mesma data todo ano. `movable`: depende da Páscoa. */
  kind?: 'fixed' | 'movable'
  /**
   * `true` para ponto facultativo nacional (Carnaval e Corpus Christi). Na prática a maioria das
   * clínicas fecha, por isso entram por padrão; use `optional: false` para deixá-los de fora.
   */
  optional?: boolean
}

/**
 * Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher).
 * Válido para qualquer ano a partir de 1583.
 */
export function easterSunday(year: number): PlainDate {
  if (!Number.isInteger(year) || year < 1583) {
    throw new AgendaError('INVALID_DATE', `Ano inválido para o cálculo da Páscoa: ${year}.`)
  }
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return formatDate(year, month, day)
}

export interface BrazilianHolidayOptions {
  /** Inclui Carnaval (segunda e terça) e Corpus Christi, que são ponto facultativo. Padrão: `true`. */
  optional?: boolean
}

/**
 * Feriados nacionais do Brasil num ano, em ordem de data.
 *
 * Fixos pela Lei 662/1949 e alterações, mais a Sexta-feira Santa (móvel) e o Dia Nacional de
 * Zumbi e da Consciência Negra, feriado nacional a partir de 2024 (Lei 14.759/2023).
 * Feriados estaduais e municipais (como São João em Pernambuco) entram pela opção `holidays`.
 */
export function brazilianHolidays(year: number, options: BrazilianHolidayOptions = {}): Holiday[] {
  const includeOptional = options.optional ?? true
  const easter = easterSunday(year)
  const fixed = (md: string, name: string): Holiday => ({ date: `${year}-${md}`, name, kind: 'fixed' })
  const movable = (offset: number, name: string, optional = false): Holiday => ({
    date: addDays(easter, offset),
    name,
    kind: 'movable',
    ...(optional ? { optional: true } : {}),
  })

  const list: Holiday[] = [
    fixed('01-01', 'Confraternização Universal'),
    movable(-2, 'Sexta-feira Santa'),
    fixed('04-21', 'Tiradentes'),
    fixed('05-01', 'Dia do Trabalho'),
    fixed('09-07', 'Independência do Brasil'),
    fixed('10-12', 'Nossa Senhora Aparecida'),
    fixed('11-02', 'Finados'),
    fixed('11-15', 'Proclamação da República'),
    fixed('12-25', 'Natal'),
  ]
  if (year >= 2024) list.push(fixed('11-20', 'Dia Nacional de Zumbi e da Consciência Negra'))
  if (includeOptional) {
    list.push(
      movable(-48, 'Carnaval (segunda-feira)', true),
      movable(-47, 'Carnaval (terça-feira)', true),
      movable(60, 'Corpus Christi', true),
    )
  }
  return list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
}

/** Feriados de vários anos de uma vez (útil para agendas que cruzam a virada do ano). */
export function brazilianHolidaysBetween(fromYear: number, toYear: number, options?: BrazilianHolidayOptions): Holiday[] {
  const out: Holiday[] = []
  for (let y = fromYear; y <= toYear; y++) out.push(...brazilianHolidays(y, options))
  return out
}
