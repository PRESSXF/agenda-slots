import type { ReasonCode } from './types'

/** Rótulos curtos, prontos para exibir. */
export const REASON_LABELS: Record<ReasonCode, string> = {
  outside_hours: 'fora do expediente',
  booking_conflict: 'conflito com agendamento',
  resource_busy: 'recurso ocupado',
  min_notice: 'antecedência mínima',
  holiday: 'feriado',
  day_off: 'folga',
  past: 'horário já passou',
  beyond_max_days: 'além do limite de dias',
  full: 'turma lotada',
  service_not_offered: 'serviço não oferecido',
  off_step: 'fora da grade de horários',
}
