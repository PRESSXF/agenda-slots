import { NOW, PROFESSIONALS, RESOURCES, TIME_ZONE } from '../clinic'
import { buildServices, gridWindow, toWeeklyHours, type PlaygroundState } from './playground'

const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`

/** Monta a chamada da biblioteca equivalente ao estado atual do playground. */
export function buildSnippet(state: PlaygroundState): string {
  const pro = PROFESSIONALS.find((p) => p.id === state.proId)!
  const service = buildServices(state).find((s) => s.id === state.serviceId)!
  const resourceIds = service.resourceIds ?? []
  const own = state.bookings.filter((b) => b.professionalId === pro.id)
  const others = state.bookings.filter(
    (b) => b.professionalId !== pro.id && (buildServices(state).find((s) => s.id === b.serviceId)?.resourceIds ?? []).some((r) => resourceIds.includes(r)),
  )
  const otherPros = [...new Set(others.map((b) => b.professionalId))]
  const usedServices = new Set([service.id, ...own.map((b) => b.serviceId!), ...others.map((b) => b.serviceId!)])
  const services = buildServices(state).filter((s) => usedServices.has(s.id))
  const resources = RESOURCES.filter((r) => services.some((s) => s.resourceIds?.includes(r.id)))
  const weekly = toWeeklyHours(state.hours[pro.id]!)
  const off = state.daysOff[pro.id] ?? []
  const year = Number(state.weekStart.slice(0, 4))

  const L: string[] = []
  L.push(`import { ${state.holidays ? 'brazilianHolidaysBetween, ' : ''}createAgenda } from 'agenda-slots'`)
  L.push('')
  L.push('const agenda = createAgenda({')
  L.push(`  timeZone: ${q(TIME_ZONE)},`)
  L.push(`  stepMinutes: ${state.stepMinutes},`)
  if (state.minNoticeMinutes > 0) L.push(`  minNoticeMinutes: ${state.minNoticeMinutes},`)
  if (state.holidays) L.push(`  holidays: brazilianHolidaysBetween(${year}, ${year + 1}),`)
  L.push('  professionals: [')
  L.push('    {')
  L.push(`      id: ${q(pro.id)},`)
  L.push('      weeklyHours: {')
  for (const [day, ranges] of Object.entries(weekly)) L.push(`        ${day}: [${ranges!.map((r) => q(String(r))).join(', ')}],`)
  L.push('      },')
  if (off.length) L.push(`      exceptions: [${off.map((d) => `{ date: ${q(d)}, hours: [] }`).join(', ')}],`)
  L.push('    },')
  for (const id of otherPros) L.push(`    { id: ${q(id)}, weeklyHours: {} }, // só para os agendamentos que dividem recurso`)
  L.push('  ],')
  L.push('  services: [')
  for (const s of services) {
    const parts = [`id: ${q(s.id)}`, `durationMinutes: ${s.durationMinutes}`]
    if (s.bufferBeforeMinutes) parts.push(`bufferBeforeMinutes: ${s.bufferBeforeMinutes}`)
    if (s.bufferAfterMinutes) parts.push(`bufferAfterMinutes: ${s.bufferAfterMinutes}`)
    if (s.resourceIds?.length) parts.push(`resourceIds: [${s.resourceIds.map(q).join(', ')}]`)
    if (s.capacity && s.capacity > 1) parts.push(`capacity: ${s.capacity}`)
    L.push(`    { ${parts.join(', ')} },`)
  }
  L.push('  ],')
  if (resources.length) L.push(`  resources: [${resources.map((r) => `{ id: ${q(r.id)} }`).join(', ')}],`)
  const bookings = [...own, ...others].sort((a, b) => String(a.start).localeCompare(String(b.start)))
  if (bookings.length) {
    L.push('  bookings: [')
    for (const b of bookings) {
      const seats = b.seats && b.seats > 1 ? `, seats: ${b.seats}` : ''
      L.push(`    { id: ${q(b.id)}, professionalId: ${q(b.professionalId)}, serviceId: ${q(b.serviceId!)}, start: ${q(String(b.start))}${seats} },`)
    }
    L.push('  ],')
  }
  L.push('})')
  L.push('')
  const w = gridWindow(state.hours[pro.id]!)
  L.push('const semana = agenda.slots({')
  L.push(`  serviceId: ${q(service.id)},`)
  L.push(`  professionalIds: [${q(pro.id)}],`)
  L.push(`  from: ${q(state.weekStart)},`)
  L.push('  days: 7,')
  L.push(`  now: ${q(NOW)},`)
  L.push('  explain: true, // motivos de cada horário indisponível')
  L.push(`  explainWindow: { start: ${q(w.start)}, end: ${q(w.end)} },`)
  L.push('})')
  return L.join('\n')
}

export type Token = { text: string; kind: 'plain' | 'string' | 'number' | 'key' | 'comment' | 'keyword' | 'fn' }

/** Realce simples: só o necessário para o trecho gerado acima. */
export function highlight(line: string): Token[] {
  const out: Token[] = []
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|\b(import|from|const|true|false)\b|\b(\d+)\b|\b([A-Za-z_]\w*)(?=\s*:)|\b([A-Za-z_]\w*)(?=\()/g
  let last = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: 'plain' })
    const kind: Token['kind'] = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'keyword' : m[4] ? 'number' : m[5] ? 'key' : 'fn'
    out.push({ text: m[0], kind })
    last = m.index + m[0].length
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: 'plain' })
  return out
}
