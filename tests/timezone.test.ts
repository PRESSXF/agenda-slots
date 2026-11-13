import { describe, expect, it } from 'vitest'
import { formatInstant, getTimeZoneOffset, getZonedParts, isValidTimeZone, toEpoch, todayIn, zonedTimeToEpoch } from '../src'

const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

describe('deslocamento e partes locais', () => {
  it('Recife fica em UTC-3 o ano todo', () => {
    expect(getTimeZoneOffset(Date.parse('2026-01-15T12:00Z'), 'America/Recife')).toBe(-3 * H)
    expect(getTimeZoneOffset(Date.parse('2026-07-15T12:00Z'), 'America/Recife')).toBe(-3 * H)
  })

  it('São Paulo tinha UTC-2 no verão de 2018/2019 e UTC-3 depois do fim do horário de verão', () => {
    expect(getTimeZoneOffset(Date.parse('2018-12-15T12:00Z'), 'America/Sao_Paulo')).toBe(-2 * H)
    expect(getTimeZoneOffset(Date.parse('2019-12-15T12:00Z'), 'America/Sao_Paulo')).toBe(-3 * H)
  })

  it('getZonedParts devolve data e hora de parede', () => {
    const p = getZonedParts(Date.parse('2026-11-16T02:30Z'), 'America/Recife')
    expect(p.date).toBe('2026-11-15')
    expect(p.time).toBe('23:30')
    expect(p.minutes).toBe(23 * 60 + 30)
  })

  it('formatInstant usa o deslocamento local, e Z para UTC', () => {
    const t = Date.parse('2026-11-16T11:00Z')
    expect(formatInstant(t, 'America/Recife')).toBe('2026-11-16T08:00:00-03:00')
    expect(formatInstant(t, 'UTC')).toBe('2026-11-16T11:00:00Z')
    expect(formatInstant(t, 'Asia/Kolkata')).toBe('2026-11-16T16:30:00+05:30')
  })

  it('valida nomes IANA', () => {
    expect(isValidTimeZone('America/Recife')).toBe(true)
    expect(isValidTimeZone('America/Atlantida')).toBe(false)
  })

  it('todayIn usa a data do fuso, não a do UTC', () => {
    expect(todayIn('America/Recife', Date.parse('2026-11-16T01:00Z'))).toBe('2026-11-15')
    expect(todayIn('Asia/Tokyo', Date.parse('2026-11-16T01:00Z'))).toBe('2026-11-16')
  })
})

describe('hora de parede para instante', () => {
  it('caso comum', () => {
    expect(iso(zonedTimeToEpoch('2026-11-16', '08:00', 'America/Recife'))).toBe('2026-11-16T11:00:00.000Z')
    expect(iso(zonedTimeToEpoch('2026-11-16', '24:00', 'America/Recife'))).toBe('2026-11-17T03:00:00.000Z')
  })

  it('São Paulo, início do horário de verão em 04/11/2018: a meia-noite não existe e vira 01:00', () => {
    expect(iso(zonedTimeToEpoch('2018-11-04', '00:00', 'America/Sao_Paulo'))).toBe('2018-11-04T03:00:00.000Z')
    expect(iso(zonedTimeToEpoch('2018-11-04', '00:30', 'America/Sao_Paulo'))).toBe('2018-11-04T03:30:00.000Z')
    expect(iso(zonedTimeToEpoch('2018-11-04', '08:00', 'America/Sao_Paulo'))).toBe('2018-11-04T10:00:00.000Z')
    expect(iso(zonedTimeToEpoch('2018-11-03', '08:00', 'America/Sao_Paulo'))).toBe('2018-11-03T11:00:00.000Z')
  })

  it('São Paulo, fim do horário de verão em 16/02/2019: 23:30 acontece duas vezes e vale a primeira', () => {
    expect(iso(zonedTimeToEpoch('2019-02-16', '23:30', 'America/Sao_Paulo'))).toBe('2019-02-17T01:30:00.000Z')
    expect(iso(zonedTimeToEpoch('2019-02-17', '08:00', 'America/Sao_Paulo'))).toBe('2019-02-17T11:00:00.000Z')
  })

  it('Nova York: 02:30 de 09/03/2025 não existe; 01:30 de 02/11/2025 é ambíguo', () => {
    expect(iso(zonedTimeToEpoch('2025-03-09', '02:30', 'America/New_York'))).toBe('2025-03-09T07:30:00.000Z')
    expect(formatInstant(zonedTimeToEpoch('2025-03-09', '02:30', 'America/New_York'), 'America/New_York')).toBe('2025-03-09T03:30:00-04:00')
    expect(iso(zonedTimeToEpoch('2025-11-02', '01:30', 'America/New_York'))).toBe('2025-11-02T05:30:00.000Z')
  })

  it('ida e volta em horas aleatórias de vários fusos', () => {
    const zones = ['America/Recife', 'America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Australia/Sydney']
    for (const tz of zones) {
      for (let k = 0; k < 40; k++) {
        const t = Date.parse('2025-01-01T00:00Z') + k * 9 * 86_400_000 + k * 37 * 60_000
        const p = getZonedParts(t, tz)
        const back = zonedTimeToEpoch(p.date, p.minutes, tz)
        // Ida e volta exata, a não ser na segunda ocorrência de uma hora repetida.
        expect([0, H]).toContain(Math.abs(back - (t - p.second * 1000 - (t % 1000))))
      }
    }
  })
})

describe('toEpoch', () => {
  it('aceita número, Date, ISO com deslocamento e ISO sem deslocamento no fuso da agenda', () => {
    const expected = Date.parse('2026-11-16T11:00Z')
    expect(toEpoch(expected, 'America/Recife')).toBe(expected)
    expect(toEpoch(new Date(expected), 'America/Recife')).toBe(expected)
    expect(toEpoch('2026-11-16T08:00:00-03:00', 'America/Recife')).toBe(expected)
    expect(toEpoch('2026-11-16T08:00', 'America/Recife')).toBe(expected)
    expect(toEpoch('2026-11-16T08:00:30', 'America/Recife')).toBe(expected + 30_000)
    expect(toEpoch('2026-11-16T08:00', 'America/New_York')).toBe(Date.parse('2026-11-16T13:00Z'))
  })

  it('recusa entradas inválidas', () => {
    expect(() => toEpoch('amanhã cedo', 'America/Recife')).toThrowError(/inválido/)
    expect(() => toEpoch(new Date('x'), 'America/Recife')).toThrowError(/inválida/)
    expect(() => toEpoch(Number.NaN, 'America/Recife')).toThrowError(/inválido/)
    expect(() => zonedTimeToEpoch('2026-11-16', '08:00', 'Mars/Olympus')).toThrowError(/desconhecido/)
  })
})
