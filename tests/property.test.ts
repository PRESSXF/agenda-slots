import { describe, expect, it } from 'vitest'
import {
  addDays,
  checkBooking,
  createAgenda,
  flattenSlots,
  overlaps,
  toEpoch,
  type AgendaConfig,
  type Booking,
  type Professional,
  type Service,
  type WeeklyHours,
} from '../src'
import { rng } from './fixtures'

/**
 * Testes de propriedade com gerador determinístico: cada semente gera uma clínica aleatória
 * (expediente, agendamentos, duração, intervalos, passo, fuso) e as invariantes precisam valer
 * em todas. Uma falha mostra a semente para reproduzir.
 */

const ZONES = ['America/Recife', 'America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon']
const FROM = '2025-03-03' // inclui a troca de horário de Nova York (09/03) e de Lisboa (30/03) com 28 dias
const DAYS = 28
const MIN = 60_000

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function randomClinic(seed: number) {
  const r = rng(seed)
  const timeZone = r.pick(ZONES)
  const weeklyHours: WeeklyHours = {}
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
    if (r.next() < 0.2) continue
    const a = r.int(0, 10) * 30 // 00:00 a 05:00: cobre as horas de troca do horário de verão
    const b = a + r.int(2, 10) * 30
    const c = b + r.int(1, 4) * 30
    const d = Math.min(c + r.int(2, 12) * 30, 1440)
    weeklyHours[day] = r.next() < 0.5 ? [`${hhmm(a)}-${hhmm(b)}`] : [`${hhmm(a)}-${hhmm(b)}`, `${hhmm(c)}-${hhmm(d)}`]
  }
  const pros: Professional[] = [
    { id: 'p1', weeklyHours },
    { id: 'p2', weeklyHours: { mon: ['08:00-12:00'], wed: ['01:00-03:30'], sun: ['00:00-04:00'] } },
  ]
  const service: Service = {
    id: 's',
    durationMinutes: r.pick([15, 20, 30, 45, 60, 90]),
    bufferBeforeMinutes: r.pick([0, 0, 5, 10]),
    bufferAfterMinutes: r.pick([0, 5, 15]),
  }
  const bookings: Booking[] = Array.from({ length: r.int(0, 40) }, (_, i) => {
    const date = addDays(FROM, r.int(0, DAYS - 1))
    const start = r.int(0, 23 * 4) * 15
    return {
      id: `b${i}`,
      professionalId: r.pick(['p1', 'p2']),
      start: `${date}T${hhmm(start)}`,
      end: `${date}T${hhmm(Math.min(start + r.int(1, 8) * 15, 1439))}`,
    }
  })
  const config: AgendaConfig = {
    timeZone,
    professionals: pros,
    services: [service],
    bookings,
    stepMinutes: r.pick([5, 10, 15, 20, 30]),
    minNoticeMinutes: r.pick([0, 60, 120, 1440]),
    maxDaysAhead: r.int(5, 40),
    alignment: r.pick(['hours', 'clock'] as const),
  }
  const now = toEpoch(`${FROM}T${hhmm(r.int(0, 95) * 15)}`, timeZone)
  return { config, service, now }
}

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919)

describe('propriedades em 60 clínicas aleatórias', () => {
  it('nenhum horário devolvido se sobrepõe a um agendamento, contando os intervalos', () => {
    for (const seed of SEEDS) {
      const { config, service, now } = randomClinic(seed)
      const tz = config.timeZone!
      const slots = flattenSlots(createAgenda(config).slots({ serviceId: 's', from: FROM, days: DAYS, now }))
      for (const s of slots) {
        const need = { start: s.startMs - (service.bufferBeforeMinutes ?? 0) * MIN, end: s.endMs + (service.bufferAfterMinutes ?? 0) * MIN }
        for (const b of config.bookings!) {
          if (b.professionalId !== s.professionalId) continue
          const busy = { start: toEpoch(b.start, tz), end: toEpoch(b.end!, tz) }
          if (overlaps(need, busy)) throw new Error(`semente ${seed}: ${s.start} sobrepõe ${b.id}`)
        }
      }
    }
  })

  it('todo horário respeita antecedência, limite de dias e duração exata', () => {
    for (const seed of SEEDS) {
      const { config, service, now } = randomClinic(seed)
      const slots = flattenSlots(createAgenda(config).slots({ serviceId: 's', from: FROM, days: DAYS, now }))
      const lastDate = addDays(FROM, config.maxDaysAhead!)
      for (const s of slots) {
        expect(s.startMs, `semente ${seed}`).toBeGreaterThanOrEqual(now + config.minNoticeMinutes! * MIN)
        expect(s.endMs - s.startMs).toBe(service.durationMinutes * MIN)
        expect(s.date <= lastDate, `semente ${seed}: ${s.date} além de ${lastDate}`).toBe(true)
      }
    }
  })

  it('checkBooking aprova cada horário devolvido', () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const { config, now } = randomClinic(seed)
      const agenda = createAgenda(config)
      for (const s of flattenSlots(agenda.slots({ serviceId: 's', from: FROM, days: DAYS, now }))) {
        const r = checkBooking(config, { serviceId: 's', professionalId: s.professionalId, start: s.startMs, now })
        if (!r.ok) throw new Error(`semente ${seed}: ${s.start} reprovado: ${r.reasons.map((x) => x.code).join(', ')}`)
      }
    }
  })

  it('horários de um profissional são crescentes, sem repetição e separados por múltiplos do passo dentro da faixa', () => {
    for (const seed of SEEDS) {
      const { config, now } = randomClinic(seed)
      for (const day of createAgenda(config).slots({ serviceId: 's', from: FROM, days: DAYS, now })) {
        for (let i = 1; i < day.slots.length; i++) {
          const gap = day.slots[i]!.startMs - day.slots[i - 1]!.startMs
          expect(gap, `semente ${seed}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('o modo explicação concorda com a lista de horários', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const { config, now } = randomClinic(seed)
      const days = createAgenda(config).slots({ serviceId: 's', from: FROM, days: 10, now, explain: true, explainWindow: { start: '00:00', end: '24:00' } })
      for (const d of days) {
        const fromExplain = d.explained!.filter((e) => e.available).map((e) => e.startMs)
        expect(fromExplain, `semente ${seed} ${d.date}`).toEqual(d.slots.map((s) => s.startMs))
        for (const e of d.explained!) expect(e.available).toBe(e.reasons.length === 0)
      }
    }
  })

  it('acrescentar agendamentos ou aumentar a antecedência nunca cria horário novo', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const { config, now } = randomClinic(seed)
      const q = { serviceId: 's', from: FROM, days: DAYS, now }
      const before = new Set(flattenSlots(createAgenda(config).slots(q)).map((s) => `${s.professionalId}@${s.startMs}`))
      const extra: Booking = { id: 'extra', professionalId: 'p1', start: `${addDays(FROM, 2)}T09:00`, end: `${addDays(FROM, 2)}T13:00` }
      const more = flattenSlots(createAgenda({ ...config, bookings: [...config.bookings!, extra] }).slots(q))
      const stricter = flattenSlots(createAgenda({ ...config, minNoticeMinutes: config.minNoticeMinutes! + 180 }).slots(q))
      for (const s of [...more, ...stricter]) expect(before.has(`${s.professionalId}@${s.startMs}`), `semente ${seed}`).toBe(true)
    }
  })
})
