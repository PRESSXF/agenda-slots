import type { Holiday } from './holidays'
import type { PlainDate, PlainTime, Weekday } from './time'
import type { InstantInput } from './timezone'

/** Faixa de horário de um dia: `"08:00-12:00"` ou `{ start: '08:00', end: '12:00' }`. */
export type TimeRangeInput = string | { start: PlainTime; end: PlainTime }

/** Expediente semanal. Dia ausente ou lista vazia significa fechado. */
export type WeeklyHours = Partial<Record<Weekday, TimeRangeInput[]>>

/** Substitui o expediente de uma data. `hours: []` é folga; com faixas, é horário especial. */
export interface DateException {
  date: PlainDate
  hours: TimeRangeInput[]
  reason?: string
}

export interface Professional {
  id: string
  name?: string
  weeklyHours: WeeklyHours
  exceptions?: DateException[]
  /** Serviços que a pessoa atende. Ausente: todos. */
  serviceIds?: string[]
}

export interface Service {
  id: string
  name?: string
  durationMinutes: number
  /** Preparo antes do atendimento. Precisa estar livre de outros agendamentos. */
  bufferBeforeMinutes?: number
  /** Limpeza ou anotações depois do atendimento. */
  bufferAfterMinutes?: number
  /** Recursos que precisam estar livres ao mesmo tempo (sala, aparelho). */
  resourceIds?: string[]
  /** Vagas por horário. Maior que 1 transforma o serviço em turma. Padrão: 1. */
  capacity?: number
}

export interface ResourceBlock {
  start: InstantInput
  end: InstantInput
  reason?: string
}

export interface Resource {
  id: string
  name?: string
  /** Quantos agendamentos o recurso aguenta ao mesmo tempo. Padrão: 1. */
  capacity?: number
  /** Períodos em que o recurso não pode ser usado (manutenção, por exemplo). */
  blocked?: ResourceBlock[]
}

export interface Booking {
  id: string
  professionalId: string
  start: InstantInput
  /** Ausente: calculado pela duração do serviço. */
  end?: InstantInput
  serviceId?: string
  /** Ausente: usa os recursos do serviço. */
  resourceIds?: string[]
  /** Vagas ocupadas numa turma. Padrão: 1. */
  seats?: number
  label?: string
}

export type Alignment = 'hours' | 'clock'

export interface AgendaConfig {
  /** Nome IANA. Padrão: `America/Recife`. */
  timeZone?: string
  professionals: Professional[]
  services: Service[]
  resources?: Resource[]
  bookings?: Booking[]
  /** Datas fechadas para todos, salvo exceção do profissional. Aceita `Holiday` ou `AAAA-MM-DD`. */
  holidays?: Array<Holiday | PlainDate>
  /** Distância entre inícios de horários, em minutos. Padrão: 15. */
  stepMinutes?: number
  /** Antecedência mínima para marcar, em minutos. Padrão: 0. */
  minNoticeMinutes?: number
  /** Até quantos dias à frente a agenda abre. Padrão: 60. */
  maxDaysAhead?: number
  /**
   * `hours` (padrão): os horários começam no início de cada faixa do expediente.
   * `clock`: os horários ficam em múltiplos do passo a partir da meia-noite.
   */
  alignment?: Alignment
}

export interface SlotQuery {
  serviceId: string
  /** Primeiro dia. Padrão: hoje no fuso da agenda. */
  from?: PlainDate
  /** Último dia, inclusive. Tem prioridade sobre `days`. */
  to?: PlainDate
  /** Quantidade de dias a partir de `from`. Padrão: 1. */
  days?: number
  /** Ausente: todos os profissionais que atendem o serviço. */
  professionalIds?: string[]
  /** Instante de referência para antecedência e limite de dias. Padrão: `Date.now()`. */
  now?: InstantInput
  /** Inclui cada horário da grade com os motivos de indisponibilidade. */
  explain?: boolean
  /** Janela da grade explicada. Padrão: do primeiro ao último horário do expediente semanal. */
  explainWindow?: { start: PlainTime; end: PlainTime }
}

export type ReasonCode =
  | 'outside_hours'
  | 'booking_conflict'
  | 'resource_busy'
  | 'min_notice'
  | 'holiday'
  | 'day_off'
  | 'past'
  | 'beyond_max_days'
  | 'full'
  | 'service_not_offered'
  | 'off_step'

export interface Reason {
  code: ReasonCode
  /** Rótulo curto em português, como "conflito com agendamento". */
  label: string
  /** Frase explicando o caso concreto. */
  detail: string
  bookingIds?: string[]
  resourceId?: string
  holiday?: string
}

export interface Slot {
  professionalId: string
  serviceId: string
  date: PlainDate
  /** Hora local de início, `HH:MM`. */
  time: PlainTime
  /** Hora local de término, `HH:MM`. */
  endTime: PlainTime
  /** ISO 8601 com deslocamento local. */
  start: string
  end: string
  startMs: number
  endMs: number
  /** Vagas restantes, só para turmas. */
  remaining?: number
}

export interface ExplainedTime {
  professionalId: string
  date: PlainDate
  time: PlainTime
  start: string
  startMs: number
  endMs: number
  available: boolean
  reasons: Reason[]
  remaining?: number
}

export interface DayAvailability {
  date: PlainDate
  weekday: Weekday
  professionalId: string
  slots: Slot[]
  /** `true` quando não há expediente nesse dia (folga, feriado ou dia sem horário). */
  closed: boolean
  holiday?: Holiday
  /** Presente com `explain: true`. */
  explained?: ExplainedTime[]
}

export interface CheckResult {
  ok: boolean
  reasons: Reason[]
  slot: Slot
}
