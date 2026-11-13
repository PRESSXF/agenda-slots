export type AgendaErrorCode =
  | 'INVALID_TIME'
  | 'INVALID_DATE'
  | 'INVALID_RANGE'
  | 'INVALID_TIME_ZONE'
  | 'INVALID_INSTANT'
  | 'INVALID_OPTION'
  | 'UNKNOWN_SERVICE'
  | 'UNKNOWN_PROFESSIONAL'
  | 'UNKNOWN_RESOURCE'

/** Erro de configuração ou de entrada. Erros de disponibilidade nunca lançam: viram motivos. */
export class AgendaError extends Error {
  readonly code: AgendaErrorCode

  constructor(code: AgendaErrorCode, message: string) {
    super(message)
    this.name = 'AgendaError'
    this.code = code
  }
}
