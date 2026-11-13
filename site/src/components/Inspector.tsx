import { CalendarCheck, CalendarX, MousePointerClick, X } from 'lucide-react'
import { getZonedParts, type ExplainedTime, type Slot } from 'agenda-slots'
import { DAYS, TIME_ZONE } from '../clinic'
import { formatShortDate } from '../lib/playground'
import { KIND_META, REASON_DOT, type CellKind, type Span } from '../lib/status'

interface Props {
  item: ExplainedTime | null
  kind: CellKind | null
  span?: Span
  serviceName: string
  suggestions: Slot[]
  next: Slot | null
  onBook: (e: ExplainedTime) => void
  onCancel: (e: ExplainedTime) => void
  onJump: (s: Slot) => void
  onClose?: () => void
}

const weekdayLong = (date: string) => {
  const n = new Date(`${date}T12:00:00Z`).getUTCDay()
  return DAYS.find((d) => d.id === (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[n])!.long
}

const endTime = (e: ExplainedTime) => getZonedParts(e.endMs, TIME_ZONE).time

export function Inspector({ item, kind, span, serviceName, suggestions, next, onBook, onCancel, onJump, onClose }: Props) {
  if (!item || !kind) {
    return (
      <div className="flex gap-3 text-sm text-muted">
        <MousePointerClick className="mt-0.5 h-5 w-5 shrink-0 text-cobalt" aria-hidden />
        <div>
          <p className="text-ink">Passe o mouse, use as setas ou toque num horário.</p>
          <p className="mt-1">Aqui aparece por que ele está livre ou não, com os motivos que a biblioteca devolve.</p>
          {next && (
            <button type="button" onClick={() => onJump(next)} className="mt-3 rounded-md bg-sky px-2.5 py-1.5 text-left text-xs font-medium text-cobalt hover:bg-cobalt hover:text-white">
              Próximo livre: {weekdayLong(next.date)}, {formatShortDate(next.date)} às {next.time}
            </button>
          )}
        </div>
      </div>
    )
  }

  const free = kind === 'free'
  const booked = kind === 'booked'
  return (
    <div className="animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {weekdayLong(item.date)}, {formatShortDate(item.date)}
          </p>
          <p className="font-display text-2xl font-semibold leading-tight">
            {item.time} <span className="text-base font-normal text-muted">às {endTime(item)}</span>
          </p>
          <p className="text-xs text-muted">{serviceName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              free ? 'bg-sky text-cobalt' : booked ? 'bg-coral text-white' : 'bg-ink/[0.07] text-ink'
            }`}
          >
            {free ? 'Livre' : booked ? 'Agendado' : 'Indisponível'}
          </span>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Fechar explicação" className="rounded-md p-1 text-muted hover:bg-paper hover:text-ink">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {booked && span && (
        <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm">
          <span className="font-semibold">{span.booking.label}</span>
          {span.booking.seats && span.booking.seats > 1 ? ` · ${span.booking.seats} vagas` : ''}
        </p>
      )}

      {item.reasons.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.reasons.map((r, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${REASON_DOT[r.code]}`} aria-hidden />
              <span>
                <span className="font-semibold">{r.label}</span>
                <span className="text-muted"> · {r.detail}</span>
                <code className="ml-1 rounded bg-paper px-1 font-mono text-[10.5px] text-muted">{r.code}</code>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Nenhum motivo contra: cabe no expediente, não choca com agendamentos nem intervalos
          {item.remaining !== undefined ? ` e a turma tem ${item.remaining} vagas` : ''}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {free && (
          <button type="button" onClick={() => onBook(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt px-3 py-2 text-sm font-semibold text-white hover:bg-cobalt/90">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Agendar este horário
          </button>
        )}
        {booked && (
          <button type="button" onClick={() => onCancel(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-coral/40 px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10">
            <CalendarX className="h-4 w-4" aria-hidden /> Cancelar agendamento
          </button>
        )}
      </div>

      {!free && suggestions.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium text-muted">
            Mais próximos, por <code className="font-mono">suggestAlternatives</code>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.startMs}
                type="button"
                onClick={() => onJump(s)}
                className="rounded-md bg-sky px-2 py-1 font-mono text-xs font-medium text-cobalt hover:bg-cobalt hover:text-white"
              >
                {s.date === item.date ? '' : `${formatShortDate(s.date)} `}
                {s.time}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="sr-only">{KIND_META[kind].label}</p>
    </div>
  )
}
