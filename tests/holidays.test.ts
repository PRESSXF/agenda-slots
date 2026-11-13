import { describe, expect, it } from 'vitest'
import { brazilianHolidays, brazilianHolidaysBetween, easterSunday } from '../src'

const byName = (year: number) => Object.fromEntries(brazilianHolidays(year).map((h) => [h.name, h.date]))

describe('Páscoa', () => {
  it('confere datas conhecidas', () => {
    expect(easterSunday(2019)).toBe('2019-04-21')
    expect(easterSunday(2024)).toBe('2024-03-31')
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2038)).toBe('2038-04-25') // a mais tardia possível
    expect(easterSunday(2285)).toBe('2285-03-22') // a mais cedo possível
  })

  it('recusa anos antes do calendário gregoriano', () => {
    expect(() => easterSunday(1500)).toThrowError(/Ano inválido/)
    expect(() => easterSunday(2025.5)).toThrowError(/Ano inválido/)
  })
})

describe('feriados nacionais', () => {
  it('2025: Carnaval 3 e 4/3, Sexta-feira Santa 18/4, Corpus Christi 19/6', () => {
    const h = byName(2025)
    expect(h['Carnaval (segunda-feira)']).toBe('2025-03-03')
    expect(h['Carnaval (terça-feira)']).toBe('2025-03-04')
    expect(h['Sexta-feira Santa']).toBe('2025-04-18')
    expect(h['Corpus Christi']).toBe('2025-06-19')
  })

  it('2026: Carnaval 16 e 17/2, Sexta-feira Santa 3/4, Corpus Christi 4/6', () => {
    const h = byName(2026)
    expect(h['Carnaval (segunda-feira)']).toBe('2026-02-16')
    expect(h['Carnaval (terça-feira)']).toBe('2026-02-17')
    expect(h['Sexta-feira Santa']).toBe('2026-04-03')
    expect(h['Corpus Christi']).toBe('2026-06-04')
  })

  it('2027: Carnaval 8 e 9/2, Sexta-feira Santa 26/3, Corpus Christi 27/5', () => {
    const h = byName(2027)
    expect(h['Carnaval (segunda-feira)']).toBe('2027-02-08')
    expect(h['Carnaval (terça-feira)']).toBe('2027-02-09')
    expect(h['Sexta-feira Santa']).toBe('2027-03-26')
    expect(h['Corpus Christi']).toBe('2027-05-27')
  })

  it('fixos de 2026 em ordem, com 13 datas no total', () => {
    const list = brazilianHolidays(2026)
    expect(list).toHaveLength(13)
    expect(list.map((x) => x.date)).toEqual([...list.map((x) => x.date)].sort())
    expect(list.filter((x) => x.kind === 'fixed').map((x) => x.date)).toEqual([
      '2026-01-01',
      '2026-04-21',
      '2026-05-01',
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ])
  })

  it('Consciência Negra só é feriado nacional a partir de 2024', () => {
    expect(byName(2023)['Dia Nacional de Zumbi e da Consciência Negra']).toBeUndefined()
    expect(byName(2024)['Dia Nacional de Zumbi e da Consciência Negra']).toBe('2024-11-20')
  })

  it('optional: false tira Carnaval e Corpus Christi', () => {
    const list = brazilianHolidays(2026, { optional: false })
    expect(list).toHaveLength(10)
    expect(list.some((x) => x.optional)).toBe(false)
  })

  it('vários anos de uma vez', () => {
    const list = brazilianHolidaysBetween(2025, 2027)
    expect(list).toHaveLength(39)
    expect(list[0]!.date).toBe('2025-01-01')
    expect(list.at(-1)!.date).toBe('2027-12-25')
  })
})
