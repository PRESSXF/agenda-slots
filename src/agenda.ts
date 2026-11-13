import { compile, slotsFromCompiled, type Compiled } from './engine'
import {
  checkFromCompiled,
  nextAvailableFromCompiled,
  suggestFromCompiled,
  type CheckQuery,
  type NextAvailableQuery,
  type SuggestQuery,
} from './helpers'
import type { AgendaConfig, CheckResult, DayAvailability, Slot, SlotQuery } from './types'

export interface Agenda {
  /** Configuração já validada (fuso e padrões aplicados). */
  readonly timeZone: string
  slots(query: SlotQuery): DayAvailability[]
  nextAvailable(query: NextAvailableQuery): Slot | null
  suggest(query: SuggestQuery): Slot[]
  check(query: CheckQuery): CheckResult
}

/**
 * Valida a configuração uma vez e devolve funções que reaproveitam os índices.
 * Use quando for fazer várias consultas sobre os mesmos agendamentos.
 */
export function createAgenda(config: AgendaConfig): Agenda {
  const c: Compiled = compile(config)
  return {
    timeZone: c.timeZone,
    slots: (q) => slotsFromCompiled(c, q),
    nextAvailable: (q) => nextAvailableFromCompiled(c, q),
    suggest: (q) => suggestFromCompiled(c, q),
    check: (q) => checkFromCompiled(c, q),
  }
}
