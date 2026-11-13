import { describe, expect, it } from 'vitest'
import { flattenSlots, getAvailableSlots, type AgendaConfig, type Professional } from '../src'

const H = 3_600_000

function cfg(timeZone: string, hours: string[], opts: Partial<AgendaConfig> = {}, duration = 60): AgendaConfig {
  const all: Professional = {
    id: 'p',
    weeklyHours: { sun: hours, mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: hours },
  }
  return { timeZone, professionals: [all], services: [{ id: 's', durationMinutes: duration }], stepMinutes: 60, maxDaysAhead: 400, ...opts }
}

const slots = (c: AgendaConfig, date: string, now: string) => flattenSlots(getAvailableSlots(c, { serviceId: 's', from: date, now }))

describe('horário de verão de São Paulo (histórico)', () => {
  it('04/11/2018: o relógio pula da meia-noite para 01:00 e o expediente 00:00-04:00 tem 3 horas', () => {
    const s = slots(cfg('America/Sao_Paulo', ['00:00-04:00']), '2018-11-04', '2018-11-01T00:00:00Z')
    expect(s.map((x) => x.time)).toEqual(['01:00', '02:00', '03:00'])
    expect(s[0]!.start).toBe('2018-11-04T01:00:00-02:00')
  })

  it('04/11/2018: consulta das 08:00 já usa UTC-2', () => {
    const s = slots(cfg('America/Sao_Paulo', ['08:00-09:00']), '2018-11-04', '2018-11-01T00:00:00Z')
    expect(s[0]!.start).toBe('2018-11-04T08:00:00-02:00')
    expect(s[0]!.startMs).toBe(Date.parse('2018-11-04T10:00:00Z'))
  })

  it('16/02/2019: 23:00 acontece duas vezes e as duas viram horário', () => {
    const s = slots(cfg('America/Sao_Paulo', ['22:00-24:00']), '2019-02-16', '2019-02-01T00:00:00Z')
    expect(s.map((x) => x.time)).toEqual(['22:00', '23:00', '23:00'])
    expect(s.map((x) => x.start)).toEqual(['2019-02-16T22:00:00-02:00', '2019-02-16T23:00:00-02:00', '2019-02-16T23:00:00-03:00'])
    expect(s[2]!.endMs - s[2]!.startMs).toBe(H)
  })
})

describe('horário de verão de Nova York', () => {
  it('09/03/2025: 02:00 não existe; o expediente 00:00-04:00 tem 3 horas reais', () => {
    const s = slots(cfg('America/New_York', ['00:00-04:00'], { stepMinutes: 30 }, 30), '2025-03-09', '2025-03-01T00:00:00Z')
    expect(s.map((x) => x.time)).toEqual(['00:00', '00:30', '01:00', '01:30', '03:00', '03:30'])
  })

  it('09/03/2025: atendimento de 1 h que começa 01:30 termina 03:30', () => {
    const s = slots(cfg('America/New_York', ['01:30-03:30']), '2025-03-09', '2025-03-01T00:00:00Z')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ time: '01:30', endTime: '03:30', end: '2025-03-09T03:30:00-04:00' })
  })

  it('02/11/2025: 01:00 se repete e o expediente 00:00-04:00 tem 5 horas reais', () => {
    const s = slots(cfg('America/New_York', ['00:00-04:00']), '2025-11-02', '2025-10-01T00:00:00Z')
    expect(s.map((x) => x.time)).toEqual(['00:00', '01:00', '01:00', '02:00', '03:00'])
    expect(s[1]!.start).toBe('2025-11-02T01:00:00-04:00')
    expect(s[2]!.start).toBe('2025-11-02T01:00:00-05:00')
  })

  it('09:00 local muda de 14:00Z para 13:00Z depois da troca', () => {
    const c = cfg('America/New_York', ['09:00-10:00'])
    expect(slots(c, '2025-03-07', '2025-03-01T00:00:00Z')[0]!.startMs).toBe(Date.parse('2025-03-07T14:00:00Z'))
    expect(slots(c, '2025-03-10', '2025-03-01T00:00:00Z')[0]!.startMs).toBe(Date.parse('2025-03-10T13:00:00Z'))
  })

  it('antecedência mínima conta horas reais, não horas de relógio', () => {
    // 00:30 EST + 2 h reais = 03:30 EDT
    const c = cfg('America/New_York', ['00:00-06:00'], { stepMinutes: 30, minNoticeMinutes: 120 }, 30)
    expect(slots(c, '2025-03-09', '2025-03-09T00:30:00-05:00')[0]!.time).toBe('03:30')
  })

  it('agendamento com horário local sem deslocamento é lido no fuso da agenda', () => {
    const c = cfg('America/New_York', ['00:00-04:00'], {
      bookings: [{ id: 'b', professionalId: 'p', start: '2025-11-02T01:00', end: '2025-11-02T01:00:00-05:00' }],
    })
    // 01:00 é ambíguo: o início sem deslocamento fica na primeira ocorrência (EDT).
    // O fim explícito em EST faz o agendamento durar 1 h real, e a segunda 01:00 continua livre.
    expect(slots(c, '2025-11-02', '2025-10-01T00:00:00Z').map((x) => x.start)).toEqual([
      '2025-11-02T00:00:00-04:00',
      '2025-11-02T01:00:00-05:00',
      '2025-11-02T02:00:00-05:00',
      '2025-11-02T03:00:00-05:00',
    ])
  })
})
