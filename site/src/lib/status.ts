import type { Booking, ExplainedTime, ReasonCode } from 'agenda-slots'

export interface Span {
  booking: Booking
  startMs: number
  endMs: number
}

export const cellKey = (e: Pick<ExplainedTime, 'date' | 'startMs'>) => `${e.date}@${e.startMs}`

export type CellKind =
  | 'free'
  | 'booked'
  | 'outside'
  | 'past'
  | 'notice'
  | 'conflict'
  | 'resource'
  | 'holiday'
  | 'dayoff'
  | 'full'
  | 'beyond'
  | 'offstep'
  | 'notoffered'

const BY_REASON: Record<ReasonCode, CellKind> = {
  holiday: 'holiday',
  day_off: 'dayoff',
  outside_hours: 'outside',
  past: 'past',
  booking_conflict: 'conflict',
  full: 'full',
  resource_busy: 'resource',
  min_notice: 'notice',
  beyond_max_days: 'beyond',
  service_not_offered: 'notoffered',
  off_step: 'offstep',
}

/** Ordem de exibição quando um horário tem vários motivos: o mais estrutural primeiro. */
const PRIORITY: ReasonCode[] = [
  'holiday',
  'day_off',
  'service_not_offered',
  'outside_hours',
  'past',
  'booking_conflict',
  'full',
  'resource_busy',
  'min_notice',
  'beyond_max_days',
  'off_step',
]

export function cellKind(e: ExplainedTime, booked: boolean): CellKind {
  if (e.available) return 'free'
  if (booked) return 'booked'
  const codes = new Set(e.reasons.map((r) => r.code))
  const top = PRIORITY.find((c) => codes.has(c))
  return top ? BY_REASON[top] : 'outside'
}

export const KIND_META: Record<CellKind, { label: string; cell: string; swatch: string }> = {
  free: { label: 'livre', cell: 'bg-sky text-cobalt hover:bg-cobalt hover:text-white', swatch: 'bg-sky ring-1 ring-cobalt/40' },
  booked: { label: 'agendado', cell: 'bg-coral text-white hover:bg-coral/90', swatch: 'bg-coral' },
  conflict: { label: 'conflito ou intervalo', cell: 'stripes-coral text-coral', swatch: 'stripes-coral ring-1 ring-coral/30' },
  resource: { label: 'recurso ocupado', cell: 'stripes-violet text-violet', swatch: 'stripes-violet ring-1 ring-violet/30' },
  notice: { label: 'antecedência mínima', cell: 'stripes-amber text-amber', swatch: 'stripes-amber ring-1 ring-amber/30' },
  holiday: { label: 'feriado', cell: 'stripes-rose text-rose', swatch: 'stripes-rose ring-1 ring-rose/30' },
  dayoff: { label: 'folga', cell: 'stripes-ink text-muted', swatch: 'stripes-ink ring-1 ring-ink/20' },
  full: { label: 'turma lotada', cell: 'stripes-ink text-ink', swatch: 'stripes-ink ring-1 ring-ink/20' },
  past: { label: 'já passou', cell: 'bg-ink/[0.06] text-muted', swatch: 'bg-ink/[0.08]' },
  outside: { label: 'fora do expediente', cell: 'bg-transparent text-muted', swatch: 'bg-card ring-1 ring-line' },
  beyond: { label: 'além do limite', cell: 'bg-ink/[0.06] text-muted', swatch: 'bg-ink/[0.08]' },
  offstep: { label: 'fora da grade', cell: 'bg-sky/40 text-muted', swatch: 'bg-sky/40' },
  notoffered: { label: 'não atende', cell: 'stripes-ink text-muted', swatch: 'stripes-ink' },
}

export const REASON_DOT: Record<ReasonCode, string> = {
  outside_hours: 'bg-muted',
  booking_conflict: 'bg-coral',
  resource_busy: 'bg-violet',
  min_notice: 'bg-amber',
  holiday: 'bg-rose',
  day_off: 'bg-ink',
  past: 'bg-muted',
  beyond_max_days: 'bg-muted',
  full: 'bg-ink',
  service_not_offered: 'bg-ink',
  off_step: 'bg-cobalt/50',
}

export const LEGEND: CellKind[] = ['free', 'booked', 'conflict', 'resource', 'notice', 'holiday', 'dayoff', 'past', 'outside']
