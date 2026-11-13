import { describe, expect, it } from 'vitest'
import {
  brazilianHolidays,
  checkBooking,
  createAgenda,
  findNextAvailable,
  formatDuration,
  getAvailableSlots,
  suggestAlternatives,
  type Booking,
} from '../src'
import { NOW, ana, base } from './fixtures'

const MON = '2026-11-16'
const booked = (id: string, start: string): Booking => ({ id, professionalId: 'ana', serviceId: 'consulta', start })

describe('findNextAvailable', () => {
  it('pula o que já passou e respeita a antecedência', () => {
    const slot = findNextAvailable(base({ minNoticeMinutes: 60 }), { serviceId: 'consulta', now: `${MON}T11:10` })
    expect(slot).toMatchObject({ date: MON, time: '14:00' })
  })

  it('atravessa feriado e folga até o próximo dia com vaga', () => {
    const slot = findNextAvailable(base({ holidays: brazilianHolidays(2026) }), { serviceId: 'consulta', now: '2026-11-19T18:00' })
    expect(slot).toMatchObject({ date: '2026-11-21', time: '08:00' })
  })

  it('usa `after` para procurar depois de um horário e escolhe o profissional mais cedo', () => {
    const bia = { ...ana, id: 'bia', weeklyHours: { tue: ['07:00-09:00'] } }
    const slot = findNextAvailable(base({ professionals: [ana, bia] }), { serviceId: 'consulta', now: NOW, after: `${MON}T18:00` })
    expect(slot).toMatchObject({ professionalId: 'bia', date: '2026-11-17', time: '07:00' })
  })

  it('devolve null quando não acha dentro da busca', () => {
    expect(findNextAvailable(base(), { serviceId: 'consulta', now: '2026-11-22T00:00', searchDays: 1 })).toBeNull()
    expect(findNextAvailable(base({ maxDaysAhead: 0 }), { serviceId: 'consulta', now: '2026-11-22T00:00' })).toBeNull()
  })
})

describe('suggestAlternatives', () => {
  it('sugere os horários mais próximos do pedido, antes e depois', () => {
    const cfg = base({ bookings: [booked('b', `${MON}T09:00`)] })
    const s = suggestAlternatives(cfg, { serviceId: 'consulta', at: `${MON}T09:00`, now: NOW })
    expect(s.map((x) => x.time)).toEqual(['08:30', '09:30', '08:00'])
  })

  it('o próprio horário vem primeiro quando está livre', () => {
    const s = suggestAlternatives(base(), { serviceId: 'consulta', at: `${MON}T10:00`, now: NOW, limit: 1 })
    expect(s[0]!.time).toBe('10:00')
  })

  it('procura em outros dias quando o dia pedido está fechado, sem voltar para o passado', () => {
    const s = suggestAlternatives(base(), { serviceId: 'consulta', at: '2026-11-15T10:00', now: NOW, limit: 2 })
    expect(s.map((x) => `${x.date} ${x.time}`)).toEqual(['2026-11-16 08:00', '2026-11-16 08:30'])
  })

  it('valida limit e rangeDays', () => {
    expect(() => suggestAlternatives(base(), { serviceId: 'consulta', at: `${MON}T10:00`, limit: 0 })).toThrowError(/limit/)
    expect(() => suggestAlternatives(base(), { serviceId: 'consulta', at: `${MON}T10:00`, rangeDays: -1 })).toThrowError(/rangeDays/)
  })
})

describe('checkBooking', () => {
  it('aprova um horário livre e devolve o slot normalizado', () => {
    const r = checkBooking(base(), { serviceId: 'consulta', professionalId: 'ana', start: `${MON}T10:00`, now: NOW })
    expect(r.ok).toBe(true)
    expect(r.reasons).toEqual([])
    expect(r.slot.end).toBe('2026-11-16T10:30:00-03:00')
  })

  it('recusa com todos os motivos de uma vez', () => {
    const cfg = base({ bookings: [booked('b', `${MON}T11:30`)], minNoticeMinutes: 180 })
    const r = checkBooking(cfg, { serviceId: 'consulta', professionalId: 'ana', start: `${MON}T11:45`, now: `${MON}T10:00` })
    expect(r.ok).toBe(false)
    expect(r.reasons.map((x) => x.code)).toEqual(['min_notice', 'outside_hours', 'booking_conflict'])
  })

  it('aceita fora da grade por padrão e recusa com requireStep', () => {
    const q = { serviceId: 'consulta', professionalId: 'ana', start: `${MON}T10:10`, now: NOW }
    expect(checkBooking(base(), q).ok).toBe(true)
    const r = checkBooking(base(), { ...q, requireStep: true })
    expect(r.reasons.map((x) => x.code)).toEqual(['off_step'])
    expect(r.reasons[0]!.label).toBe('fora da grade de horários')
    expect(checkBooking(base(), { ...q, start: `${MON}T10:30`, requireStep: true }).ok).toBe(true)
  })
})

describe('createAgenda', () => {
  it('reaproveita a configuração compilada e dá o mesmo resultado das funções soltas', () => {
    const cfg = base({ bookings: [booked('b', `${MON}T09:00`)] })
    const agenda = createAgenda(cfg)
    const q = { serviceId: 'consulta', from: MON, days: 3, now: NOW }
    expect(agenda.slots(q)).toEqual(getAvailableSlots(cfg, q))
    expect(agenda.nextAvailable({ serviceId: 'consulta', now: NOW })).toEqual(findNextAvailable(cfg, { serviceId: 'consulta', now: NOW }))
    expect(agenda.suggest({ serviceId: 'consulta', at: `${MON}T09:00`, now: NOW })).toHaveLength(3)
    expect(agenda.check({ serviceId: 'consulta', professionalId: 'ana', start: `${MON}T09:00`, now: NOW }).ok).toBe(false)
  })

  it('sem `from`, começa no dia de hoje do fuso', () => {
    const [day] = createAgenda(base()).slots({ serviceId: 'consulta', now: '2026-11-16T01:00:00Z' })
    expect(day!.date).toBe('2026-11-15')
  })
})

describe('formatDuration', () => {
  it('escreve durações como uma pessoa escreveria', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(1440)).toBe('24 h')
    expect(formatDuration(2880)).toBe('2 dias')
  })
})
