import { describe, expect, it } from 'vitest'
import { AgendaError, addDays, dateRange, diffDays, formatTime, parseTime, weekdayOf } from '../src'

describe('horas e datas civis', () => {
  it('lê e escreve HH:MM, incluindo 24:00 como fim do dia', () => {
    expect(parseTime('08:30')).toBe(510)
    expect(parseTime('24:00')).toBe(1440)
    expect(formatTime(510)).toBe('08:30')
    expect(formatTime(0)).toBe('00:00')
  })

  it('recusa horas mal formadas ou fora do intervalo', () => {
    for (const bad of ['8:30', '25:00', '24:01', '12:60', 'meio-dia']) {
      expect(() => parseTime(bad)).toThrowError(AgendaError)
    }
  })

  it('soma dias atravessando mês, ano e 29 de fevereiro', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('diferença em dias e dia da semana', () => {
    expect(diffDays('2026-11-16', '2026-11-23')).toBe(7)
    expect(diffDays('2026-11-23', '2026-11-16')).toBe(-7)
    expect(weekdayOf('2026-11-16')).toBe('mon')
    expect(weekdayOf('2026-11-22')).toBe('sun')
  })

  it('dateRange é inclusivo e recusa intervalo invertido', () => {
    expect(dateRange('2026-11-16', '2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
    expect(() => dateRange('2026-11-18', '2026-11-16')).toThrowError(/anterior/)
  })

  it('recusa datas inexistentes', () => {
    expect(() => addDays('2026-02-30', 1)).toThrowError(/inexistente/)
    expect(() => addDays('16/11/2026', 1)).toThrowError(/AAAA-MM-DD/)
  })
})
