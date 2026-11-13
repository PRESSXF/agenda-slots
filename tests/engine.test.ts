import { describe, expect, it } from 'vitest'
import { AgendaError, brazilianHolidays, createAgenda, flattenSlots, getAvailableSlots, type AgendaConfig, type DayAvailability } from '../src'
import { NOW, ana, base, consulta } from './fixtures'

const MON = '2026-11-16'
const times = (days: DayAvailability[]) => flattenSlots(days).map((s) => s.time)
const slotsOn = (config: AgendaConfig, date = MON, serviceId = 'consulta', now = NOW) =>
  times(getAvailableSlots(config, { serviceId, from: date, now }))

describe('expediente', () => {
  it('gera horários nas duas faixas do dia, sem atravessar o almoço', () => {
    const t = slotsOn(base())
    expect(t).toHaveLength(16)
    expect(t.slice(0, 3)).toEqual(['08:00', '08:30', '09:00'])
    expect(t).toContain('11:30')
    expect(t).not.toContain('12:00')
    expect(t).not.toContain('13:30')
    expect(t.at(-1)).toBe('17:30')
  })

  it('o último horário termina exatamente no fim do expediente', () => {
    const t = slotsOn(base({ services: [{ id: 'consulta', durationMinutes: 50 }], stepMinutes: 10 }))
    expect(t.filter((x) => x < '12:00').at(-1)).toBe('11:10') // 11:10 + 50 = 12:00
    expect(t).not.toContain('11:20')
  })

  it('domingo sem expediente fica fechado', () => {
    const [day] = getAvailableSlots(base(), { serviceId: 'consulta', from: '2026-11-22', now: NOW })
    expect(day!.closed).toBe(true)
    expect(day!.slots).toEqual([])
    expect(day!.weekday).toBe('sun')
  })

  it('faixas sobrepostas no cadastro são fundidas', () => {
    const p = { ...ana, weeklyHours: { mon: ['08:00-10:00', '09:00-11:00', { start: '11:00', end: '12:00' }] } }
    expect(slotsOn(base({ professionals: [p] }))).toHaveLength(8)
  })

  it('aceita 24:00 como fim do dia', () => {
    const p = { ...ana, weeklyHours: { mon: ['22:00-24:00'] } }
    expect(slotsOn(base({ professionals: [p] }))).toEqual(['22:00', '22:30', '23:00', '23:30'])
  })

  it('cada slot traz ISO com deslocamento, hora final e milissegundos', () => {
    const [first] = flattenSlots(getAvailableSlots(base(), { serviceId: 'consulta', from: MON, now: NOW }))
    expect(first).toEqual({
      professionalId: 'ana',
      serviceId: 'consulta',
      date: MON,
      time: '08:00',
      endTime: '08:30',
      start: '2026-11-16T08:00:00-03:00',
      end: '2026-11-16T08:30:00-03:00',
      startMs: Date.parse('2026-11-16T11:00Z'),
      endMs: Date.parse('2026-11-16T11:30Z'),
    })
  })

  it('consulta de vários dias com `days` e com `to`', () => {
    const a = getAvailableSlots(base(), { serviceId: 'consulta', from: MON, days: 7, now: NOW })
    const b = getAvailableSlots(base(), { serviceId: 'consulta', from: MON, to: '2026-11-22', now: NOW })
    expect(a).toHaveLength(7)
    expect(b).toEqual(a)
    // seg, ter, qui, sex: 16; qua e sáb: 8; dom: 0
    expect(a.map((d) => d.slots.length)).toEqual([16, 16, 8, 16, 16, 8, 0])
  })
})

describe('passo e alinhamento', () => {
  it('passo de 15 min com consulta de 30 min', () => {
    const t = slotsOn(base({ stepMinutes: 15 }))
    expect(t.slice(0, 4)).toEqual(['08:00', '08:15', '08:30', '08:45'])
    expect(t.filter((x) => x < '12:00').at(-1)).toBe('11:30')
  })

  it('alignment "hours" começa no início da faixa; "clock" alinha pela meia-noite', () => {
    const p = { ...ana, weeklyHours: { mon: ['08:10-10:00'] } }
    expect(slotsOn(base({ professionals: [p] }))).toEqual(['08:10', '08:40', '09:10'])
    expect(slotsOn(base({ professionals: [p], alignment: 'clock' }))).toEqual(['08:30', '09:00', '09:30'])
  })
})

describe('agendamentos e intervalos', () => {
  const booking = { id: 'b1', professionalId: 'ana', serviceId: 'consulta', start: `${MON}T09:00`, label: 'Paciente A' }

  it('remove o horário ocupado e mantém os vizinhos encostados', () => {
    const t = slotsOn(base({ bookings: [booking] }))
    expect(t).not.toContain('09:00')
    expect(t).toContain('08:30')
    expect(t).toContain('09:30')
  })

  it('com passo menor, nenhum horário que encoste por dentro sobra', () => {
    const t = slotsOn(base({ bookings: [booking], stepMinutes: 15 }))
    expect(t).not.toContain('08:45') // 08:45-09:15 sobrepõe 09:00-09:30
    expect(t).not.toContain('09:15')
    expect(t).toContain('08:30')
    expect(t).toContain('09:30')
  })

  it('agendamento sem serviço usa o fim informado (bloqueio pessoal)', () => {
    const block = { id: 'reuniao', professionalId: 'ana', start: `${MON}T10:00`, end: `${MON}T11:00` }
    const t = slotsOn(base({ bookings: [block] }))
    expect(t).not.toContain('10:00')
    expect(t).not.toContain('10:30')
    expect(t).toContain('11:00')
  })

  it('agendamentos sobrepostos entre si continuam bloqueando a união', () => {
    const bookings = [
      { id: 'x', professionalId: 'ana', start: `${MON}T08:00`, end: `${MON}T09:15` },
      { id: 'y', professionalId: 'ana', start: `${MON}T09:00`, end: `${MON}T10:00` },
    ]
    expect(slotsOn(base({ bookings })).filter((x) => x < '12:00')).toEqual(['10:00', '10:30', '11:00', '11:30'])
  })

  it('preparo e limpeza do novo atendimento afastam dos vizinhos', () => {
    const services = [{ ...consulta, bufferBeforeMinutes: 10, bufferAfterMinutes: 10 }]
    const block = { id: 'r', professionalId: 'ana', start: `${MON}T09:00`, end: `${MON}T09:30` }
    const t = slotsOn(base({ services, bookings: [block], stepMinutes: 10 }))
    expect(t).not.toContain('08:30') // termina 09:00 + 10 de limpeza
    expect(t).toContain('08:20')
    expect(t).not.toContain('09:30') // precisa de 10 de preparo
    expect(t).toContain('09:40')
  })

  it('os intervalos do agendamento existente também contam', () => {
    const services = [{ ...consulta, bufferAfterMinutes: 15 }]
    const t = slotsOn(base({ services, bookings: [booking] }))
    // 09:00-09:30 + 15 de limpeza; o novo também precisa de 15 depois
    expect(t).not.toContain('08:30') // 08:30-09:00 + 15 de limpeza encosta no 09:00
    expect(t).toContain('08:00')
    expect(t).not.toContain('09:30')
    expect(t).toContain('10:00')
  })

  it('preparo antes da abertura é permitido: só o atendimento precisa caber no expediente', () => {
    const services = [{ ...consulta, bufferBeforeMinutes: 15 }]
    expect(slotsOn(base({ services }))[0]).toBe('08:00')
  })

  it('agendamentos de outro profissional não bloqueiam', () => {
    const bia = { ...ana, id: 'bia', name: 'Bia' }
    const days = getAvailableSlots(base({ professionals: [ana, bia], bookings: [booking] }), {
      serviceId: 'consulta',
      from: MON,
      now: NOW,
    })
    expect(days.find((d) => d.professionalId === 'bia')!.slots.map((s) => s.time)).toContain('09:00')
    expect(days.find((d) => d.professionalId === 'ana')!.slots.map((s) => s.time)).not.toContain('09:00')
  })
})

describe('recursos', () => {
  const sala = { id: 'sala', name: 'Sala 1' }
  const bia = { ...ana, id: 'bia', name: 'Bia' }
  const services = [{ ...consulta, resourceIds: ['sala'] }]

  it('sala ocupada por outro profissional bloqueia o horário', () => {
    const bookings = [{ id: 'b', professionalId: 'bia', serviceId: 'consulta', start: `${MON}T09:00` }]
    const config = base({ professionals: [ana, bia], services, resources: [sala], bookings })
    const t = times(getAvailableSlots(config, { serviceId: 'consulta', from: MON, professionalIds: ['ana'], now: NOW }))
    expect(t).not.toContain('09:00')
    expect(t).toContain('09:30')
  })

  it('recurso com capacidade 2 aceita dois usos simultâneos', () => {
    const cleo = { ...ana, id: 'cleo' }
    const bookings = [{ id: 'b', professionalId: 'bia', serviceId: 'consulta', start: `${MON}T09:00` }]
    const resources = [{ ...sala, capacity: 2 }]
    const cfg = base({ professionals: [ana, bia, cleo], services, resources, bookings })
    expect(times(getAvailableSlots(cfg, { serviceId: 'consulta', from: MON, professionalIds: ['ana'], now: NOW }))).toContain('09:00')
    const cfg2 = { ...cfg, bookings: [...bookings, { id: 'c', professionalId: 'cleo', serviceId: 'consulta', start: `${MON}T09:00` }] }
    expect(times(getAvailableSlots(cfg2, { serviceId: 'consulta', from: MON, professionalIds: ['ana'], now: NOW }))).not.toContain('09:00')
  })

  it('bloqueio de manutenção no recurso', () => {
    const resources = [{ ...sala, blocked: [{ start: `${MON}T14:00`, end: `${MON}T16:00`, reason: 'manutenção' }] }]
    const days = getAvailableSlots(base({ services, resources }), { serviceId: 'consulta', from: MON, now: NOW, explain: true })
    const t = times(days)
    expect(t).not.toContain('15:30')
    expect(t).toContain('16:00')
    const why = days[0]!.explained!.find((e) => e.time === '14:00')!.reasons
    expect(why.map((r) => r.code)).toEqual(['resource_busy'])
    expect(why[0]!.detail).toContain('manutenção')
  })
})

describe('turmas com capacidade', () => {
  const pilates = { id: 'pilates', name: 'Pilates', durationMinutes: 60, capacity: 3 }
  const seat = (id: string, start: string, seats = 1) => ({ id, professionalId: 'ana', serviceId: 'pilates', start, seats })

  it('mostra vagas restantes e fecha quando lota', () => {
    const cfg = base({ services: [pilates], stepMinutes: 60, bookings: [seat('a', `${MON}T08:00`), seat('b', `${MON}T08:00`)] })
    const slots = flattenSlots(getAvailableSlots(cfg, { serviceId: 'pilates', from: MON, now: NOW }))
    expect(slots[0]).toMatchObject({ time: '08:00', remaining: 1 })
    expect(slots[1]).toMatchObject({ time: '09:00', remaining: 3 })
    const full = { ...cfg, bookings: [...cfg.bookings!, seat('c', `${MON}T08:00`)] }
    expect(times(getAvailableSlots(full, { serviceId: 'pilates', from: MON, now: NOW }))).not.toContain('08:00')
  })

  it('reserva de várias vagas de uma vez', () => {
    const cfg = base({ services: [pilates], stepMinutes: 60, bookings: [seat('a', `${MON}T08:00`, 3)] })
    const [day] = getAvailableSlots(cfg, { serviceId: 'pilates', from: MON, now: NOW, explain: true })
    expect(day!.explained![0]!.reasons.map((r) => r.code)).toEqual(['full'])
  })

  it('uma turma em outro horário que se sobrepõe é conflito, não vaga', () => {
    const cfg = base({ services: [pilates], stepMinutes: 30, bookings: [seat('a', `${MON}T08:30`)] })
    const t = times(getAvailableSlots(cfg, { serviceId: 'pilates', from: MON, now: NOW }))
    expect(t).toContain('08:30')
    expect(t).not.toContain('08:00')
    expect(t).not.toContain('09:00')
  })

  it('alunos da mesma turma dividem a sala uma vez só', () => {
    const studio = { id: 'estudio', name: 'Estúdio' }
    const cfg = base({
      services: [{ ...pilates, resourceIds: ['estudio'] }],
      resources: [studio],
      stepMinutes: 60,
      bookings: [seat('a', `${MON}T08:00`), seat('b', `${MON}T08:00`)],
    })
    expect(flattenSlots(getAvailableSlots(cfg, { serviceId: 'pilates', from: MON, now: NOW }))[0]).toMatchObject({ time: '08:00', remaining: 1 })
  })
})

describe('regras de tempo', () => {
  it('antecedência mínima de 2 h a partir de agora', () => {
    const now = `${MON}T09:10`
    const t = slotsOn(base({ minNoticeMinutes: 120 }), MON, 'consulta', now)
    expect(t[0]).toBe('11:30')
  })

  it('horário que já passou tem motivo próprio', () => {
    const [day] = getAvailableSlots(base({ minNoticeMinutes: 60 }), { serviceId: 'consulta', from: MON, now: `${MON}T09:10`, explain: true })
    const at = (time: string) => day!.explained!.find((e) => e.time === time)!.reasons.map((r) => r.code)
    expect(at('08:30')).toEqual(['past'])
    expect(at('10:00')).toEqual(['min_notice'])
    expect(at('10:30')).toEqual([])
  })

  it('limite de dias à frente', () => {
    const cfg = base({ maxDaysAhead: 3 })
    const days = getAvailableSlots(cfg, { serviceId: 'consulta', from: MON, days: 5, now: NOW })
    // hoje é 15/11; até 18/11 abre
    expect(days.map((d) => d.slots.length > 0)).toEqual([true, true, true, false, false])
  })
})

describe('feriados e exceções', () => {
  const holidays = brazilianHolidays(2026)
  const FRI = '2026-11-20'

  it('fecha no feriado e informa o nome', () => {
    const [day] = getAvailableSlots(base({ holidays }), { serviceId: 'consulta', from: FRI, now: NOW, explain: true })
    expect(day!.closed).toBe(true)
    expect(day!.holiday?.name).toBe('Dia Nacional de Zumbi e da Consciência Negra')
    expect(day!.explained![0]!.reasons[0]).toMatchObject({ code: 'holiday', label: 'feriado' })
  })

  it('aceita feriado local como string', () => {
    expect(slotsOn(base({ holidays: [MON] }))).toEqual([])
  })

  it('exceção abre em horário especial num feriado', () => {
    const p = { ...ana, exceptions: [{ date: FRI, hours: ['09:00-11:00'] }] }
    expect(slotsOn(base({ professionals: [p], holidays }), FRI)).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  it('exceção de folga com motivo', () => {
    const p = { ...ana, exceptions: [{ date: MON, hours: [], reason: 'congresso' }] }
    const [day] = getAvailableSlots(base({ professionals: [p] }), { serviceId: 'consulta', from: MON, now: NOW, explain: true })
    expect(day!.slots).toEqual([])
    expect(day!.explained![0]!.reasons[0]).toMatchObject({ code: 'day_off', detail: 'Folga: congresso.' })
  })
})

describe('profissionais e serviços', () => {
  it('lista só quem atende o serviço, mas explica quando o profissional é pedido', () => {
    const bia = { ...ana, id: 'bia', name: 'Bia', serviceIds: ['outro'] }
    const cfg = base({ professionals: [ana, bia], services: [consulta, { id: 'outro', durationMinutes: 20 }] })
    expect(getAvailableSlots(cfg, { serviceId: 'consulta', from: MON, now: NOW }).map((d) => d.professionalId)).toEqual(['ana'])
    const [day] = getAvailableSlots(cfg, { serviceId: 'consulta', from: MON, now: NOW, professionalIds: ['bia'], explain: true })
    expect(day!.slots).toEqual([])
    expect(day!.explained![0]!.reasons[0]!.code).toBe('service_not_offered')
  })
})

describe('modo explicação', () => {
  it('cobre a janela do expediente semanal e marca cada motivo', () => {
    const bookings = [{ id: 'b1', professionalId: 'ana', serviceId: 'consulta', start: `${MON}T09:00`, label: 'Paciente A' }]
    const [day] = getAvailableSlots(base({ bookings }), { serviceId: 'consulta', from: MON, now: NOW, explain: true })
    const ex = day!.explained!
    expect(ex[0]!.time).toBe('08:00')
    expect(ex.at(-1)!.time).toBe('17:30')
    const nine = ex.find((e) => e.time === '09:00')!
    expect(nine.available).toBe(false)
    expect(nine.reasons[0]).toMatchObject({ code: 'booking_conflict', label: 'conflito com agendamento', bookingIds: ['b1'] })
    expect(nine.reasons[0]!.detail).toBe('Choca com Paciente A (09:00 às 09:30).')
    const lunch = ex.find((e) => e.time === '12:30')!
    expect(lunch.reasons[0]!.code).toBe('outside_hours')
    expect(lunch.reasons[0]!.detail).toContain('08:00 às 12:00 e 14:00 às 18:00')
    expect(ex.filter((e) => e.available).map((e) => e.time)).toEqual(day!.slots.map((s) => s.time))
  })

  it('janela personalizada e motivos acumulados', () => {
    const [day] = getAvailableSlots(base({ minNoticeMinutes: 600 }), {
      serviceId: 'consulta',
      from: MON,
      now: `${MON}T06:00`,
      explain: true,
      explainWindow: { start: '07:00', end: '08:00' },
    })
    expect(day!.explained!.map((e) => e.time)).toEqual(['07:00', '07:30'])
    expect(day!.explained![0]!.reasons.map((r) => r.code)).toEqual(['min_notice', 'outside_hours'])
    expect(day!.explained![0]!.reasons[0]!.detail).toBe('Exige 10 h de antecedência: marcações a partir de 16/11 às 16:00.')
  })
})

describe('validação da configuração', () => {
  it('recusa fuso, passo, duração e faixas inválidos com AgendaError', () => {
    const cases: AgendaConfig[] = [
      base({ timeZone: 'Brasil/Recife' }),
      base({ stepMinutes: 0 }),
      base({ stepMinutes: 7.5 }),
      base({ services: [{ id: 'x', durationMinutes: -10 }] }),
      base({ professionals: [{ id: 'p', weeklyHours: { mon: ['12:00-08:00'] } }] }),
      base({ professionals: [{ id: 'p', weeklyHours: { mon: ['08:00'] } }] }),
      base({ alignment: 'meio' as never }),
    ]
    for (const cfg of cases) expect(() => createAgenda(cfg)).toThrowError(AgendaError)
  })

  it('recusa referências desconhecidas', () => {
    expect(() => createAgenda(base({ bookings: [{ id: 'b', professionalId: 'zé', start: `${MON}T09:00`, end: `${MON}T10:00` }] }))).toThrowError(/zé/)
    expect(() => createAgenda(base({ bookings: [{ id: 'b', professionalId: 'ana', serviceId: 'x', start: `${MON}T09:00` }] }))).toThrowError(/serviço "x"/)
    expect(() => createAgenda(base({ services: [{ ...consulta, resourceIds: ['sala'] }] }))).toThrowError(/recurso "sala"/)
    expect(() => createAgenda(base({ professionals: [{ ...ana, serviceIds: ['x'] }] }))).toThrowError(/"x"/)
    expect(() => getAvailableSlots(base(), { serviceId: 'x', from: MON })).toThrowError(/desconhecido/)
    expect(() => getAvailableSlots(base(), { serviceId: 'consulta', from: MON, professionalIds: ['zé'] })).toThrowError(/desconhecido/)
  })

  it('recusa agendamento sem fim e sem serviço, ou invertido', () => {
    expect(() => createAgenda(base({ bookings: [{ id: 'b', professionalId: 'ana', start: `${MON}T09:00` }] }))).toThrowError(/end/)
    expect(() => createAgenda(base({ bookings: [{ id: 'b', professionalId: 'ana', start: `${MON}T09:00`, end: `${MON}T08:00` }] }))).toThrowError(/antes/)
    expect(() =>
      createAgenda(base({ resources: [{ id: 's', blocked: [{ start: `${MON}T09:00`, end: `${MON}T09:00` }] }] })),
    ).toThrowError(/Bloqueio/)
  })

  it('usa America/Recife como padrão', () => {
    expect(createAgenda(base()).timeZone).toBe('America/Recife')
  })
})
