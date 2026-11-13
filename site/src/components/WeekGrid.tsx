import { useMemo, useRef, type KeyboardEvent } from 'react'
import { CalendarOff } from 'lucide-react'
import type { DayAvailability, ExplainedTime } from 'agenda-slots'
import { DAYS } from '../clinic'
import { formatShortDate } from '../lib/playground'
import { KIND_META, cellKey, cellKind, type CellKind, type Span } from '../lib/status'

interface Props {
  days: DayAvailability[]
  spans: Span[]
  stepMinutes: number
  inspectedKey: string | null
  daysOff: string[]
  mobileDate: string
  onMobileDate: (date: string) => void
  onInspect: (e: ExplainedTime) => void
  onActivate: (e: ExplainedTime, kind: CellKind) => void
  onToggleDayOff: (date: string) => void
}

function spanAt(spans: Span[], t: number) {
  return spans.filter((s) => s.startMs <= t && t < s.endMs).at(-1)
}

function ariaFor(e: ExplainedTime, kind: CellKind, span?: Span) {
  const d = DAYS.find((x) => x.id === weekdayOfDate(e.date))!
  const when = `${d.long}, ${formatShortDate(e.date)}, ${e.time}`
  if (kind === 'free') return `${when}: livre${e.remaining !== undefined ? `, ${e.remaining} vagas` : ''}. Ativar para agendar.`
  if (kind === 'booked') return `${when}: agendado para ${span?.booking.label}. Ativar para cancelar.`
  return `${when}: indisponível, ${e.reasons.map((r) => r.label).join(', ')}.`
}

function weekdayOfDate(date: string) {
  const n = new Date(`${date}T12:00:00Z`).getUTCDay()
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[n]
}

export function WeekGrid(props: Props) {
  const { days, spans, stepMinutes, inspectedKey, onInspect, onActivate } = props
  const gridRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const set = new Set<string>()
    for (const d of days) for (const e of d.explained ?? []) set.add(e.time)
    return [...set].sort()
  }, [days])

  const byDay = useMemo(
    () => days.map((d) => new Map((d.explained ?? []).map((e) => [e.time, e] as const))),
    [days],
  )

  const move = (ev: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const d = delta[ev.key]
    if (!d) return
    ev.preventDefault()
    const nr = Math.max(0, Math.min(rows.length - 1, r + d[0]))
    const nc = Math.max(0, Math.min(days.length - 1, c + d[1]))
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${nr}-${nc}"]`)?.focus()
  }

  const activeKey = inspectedKey ?? (byDay[0]?.get(rows[0] ?? '') ? cellKey(byDay[0].get(rows[0]!)!) : null)
  const mobileIndex = Math.max(0, days.findIndex((d) => d.date === props.mobileDate))
  const mobileDay = days[mobileIndex]

  return (
    <div>
      {/* Grade semanal (telas largas) */}
      <div className="hidden lg:block">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Horários da semana"
          className="grid gap-x-1"
          style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div role="row" className="contents">
            <div role="columnheader" className="sticky top-0 z-10 bg-card" />
            {days.map((d) => {
              const w = DAYS.find((x) => x.id === d.weekday)!
              const off = props.daysOff.includes(d.date)
              return (
                <div role="columnheader" key={d.date} className="sticky top-0 z-10 bg-card pb-2 pt-3">
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{w.short}</div>
                      <div className="font-display text-lg font-semibold leading-none">{formatShortDate(d.date)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onToggleDayOff(d.date)}
                      aria-pressed={off}
                      aria-label={off ? `Desmarcar folga de ${w.long}` : `Marcar folga na ${w.long}`}
                      title={off ? 'Desmarcar folga' : 'Marcar folga'}
                      className={`rounded-md p-1 transition ${off ? 'bg-ink text-paper' : 'text-muted hover:bg-paper hover:text-ink'}`}
                    >
                      <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-1 h-4 truncate text-[11px]">
                    {d.holiday ? (
                      <span className="font-medium text-rose" title={d.holiday.name}>
                        {d.holiday.name}
                      </span>
                    ) : (
                      <span className="text-muted">
                        <span className="font-semibold text-cobalt">{d.slots.length}</span> livres
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {rows.map((time, r) => (
            <div role="row" key={time} className="contents">
              <div role="rowheader" className="-mt-1.5 pr-2 text-right font-mono text-[10.5px] text-muted">
                {time.endsWith(':00') || stepMinutes >= 30 ? time : ''}
              </div>
              {byDay.map((map, c) => {
                const e = map.get(time)
                if (!e) return <div role="gridcell" key={c} className="h-6" />
                const span = spanAt(spans, e.startMs)
                const kind = cellKind(e, !!span)
                const key = cellKey(e)
                const isStart = span && span.startMs >= e.startMs && span.startMs < e.startMs + stepMinutes * 60_000
                const hourLine = time.endsWith(':00') ? 'border-t border-line/80' : 'border-t border-transparent'
                return (
                  <div role="gridcell" key={c} className={hourLine}>
                    <button
                      type="button"
                      data-cell={`${r}-${c}`}
                      tabIndex={key === activeKey ? 0 : -1}
                      aria-label={ariaFor(e, kind, span)}
                      onMouseEnter={() => onInspect(e)}
                      onFocus={() => onInspect(e)}
                      onClick={() => onActivate(e, kind)}
                      onKeyDown={(ev) => move(ev, r, c)}
                      className={`relative mt-px flex h-[22px] w-full items-center overflow-hidden rounded-[5px] px-1.5 text-left text-[10.5px] leading-none transition-colors ${KIND_META[kind].cell} ${
                        key === inspectedKey ? 'ring-2 ring-ink ring-offset-1 ring-offset-card' : ''
                      }`}
                    >
                      {kind === 'free' && (
                        <span className="whitespace-nowrap font-mono font-medium">
                          {e.time}
                          {e.remaining !== undefined && <span className="opacity-75"> {e.remaining}v</span>}
                        </span>
                      )}
                      {kind === 'booked' && isStart && <span className="truncate font-semibold">{span!.booking.label}</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Lista de um dia (celular e tablet) */}
      <div className="lg:hidden">
        <div role="tablist" aria-label="Dia da semana" className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const w = DAYS.find((x) => x.id === d.weekday)!
            const sel = d.date === mobileDay?.date
            return (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => props.onMobileDate(d.date)}
                className={`flex flex-col items-center rounded-lg py-1.5 transition ${
                  sel ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-line/60'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{w.short}</span>
                <span className="font-display text-base font-semibold leading-tight">{d.date.slice(8, 10)}</span>
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${d.holiday ? 'bg-rose' : d.slots.length ? 'bg-cobalt' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {mobileDay && (
          <div role="tabpanel" className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm">
                {mobileDay.holiday ? (
                  <span className="font-medium text-rose">{mobileDay.holiday.name}</span>
                ) : (
                  <>
                    <span className="font-semibold text-cobalt">{mobileDay.slots.length}</span> horários livres
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => props.onToggleDayOff(mobileDay.date)}
                aria-pressed={props.daysOff.includes(mobileDay.date)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
              >
                <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                {props.daysOff.includes(mobileDay.date) ? 'Desmarcar folga' : 'Marcar folga'}
              </button>
            </div>
            <ul className="space-y-1">
              {(mobileDay.explained ?? []).map((e) => {
                const span = spanAt(spans, e.startMs)
                const kind = cellKind(e, !!span)
                const key = cellKey(e)
                const dim = kind === 'outside'
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        onInspect(e)
                        onActivate(e, kind)
                      }}
                      aria-label={ariaFor(e, kind, span)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${dim ? 'h-8 opacity-70' : 'h-10'} ${
                        KIND_META[kind].cell
                      } ${key === inspectedKey ? 'ring-2 ring-ink' : ''}`}
                    >
                      <span className="w-11 shrink-0 font-mono text-[13px] font-medium">{e.time}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {kind === 'free'
                          ? `livre${e.remaining !== undefined ? ` · ${e.remaining} vagas` : ''}`
                          : kind === 'booked'
                            ? span!.booking.label
                            : KIND_META[kind].label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
