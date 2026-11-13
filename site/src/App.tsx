import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Github, Timer } from 'lucide-react'
import { addDays, type ExplainedTime, type Slot, type Weekday } from 'agenda-slots'
import { NOW, PATIENTS, PROFESSIONALS, SERVICES, type DayHours } from './clinic'
import { CodePanel } from './components/CodePanel'
import { Controls } from './components/Controls'
import { Inspector } from './components/Inspector'
import { WeekGrid } from './components/WeekGrid'
import { compute, formatShortDate, initialState, suggestFor, type PlaygroundState } from './lib/playground'
import { buildSnippet } from './lib/snippet'
import { KIND_META, LEGEND, cellKey, cellKind, type Span } from './lib/status'

// Aquecimento: a primeira execução inclui a criação dos formatadores do Intl.
compute(initialState())

const REPO = 'https://github.com/PRESSXF/agenda-slots'
const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']

function weekTitle(start: string) {
  const end = addDays(start, 6)
  const m1 = MONTHS[Number(start.slice(5, 7)) - 1]
  const m2 = MONTHS[Number(end.slice(5, 7)) - 1]
  const d1 = Number(start.slice(8, 10))
  const d2 = Number(end.slice(8, 10))
  return m1 === m2 ? `${d1} a ${d2} de ${m1} ${end.slice(0, 4)}` : `${d1} de ${m1} a ${d2} de ${m2} ${end.slice(0, 4)}`
}

function useIsDesktop() {
  const query = '(min-width: 1024px)'
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

export default function App() {
  const [state, setState] = useState<PlaygroundState>(initialState)
  const [inspected, setInspected] = useState<{ date: string; startMs: number } | null>(null)
  const [mobileDate, setMobileDate] = useState(state.weekStart)
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [counter, setCounter] = useState(0)
  const desktop = useIsDesktop()

  const computed = useMemo(() => compute(state), [state])
  const code = useMemo(() => buildSnippet(state), [state])
  const pro = PROFESSIONALS.find((p) => p.id === state.proId)!
  const service = SERVICES.find((s) => s.id === state.serviceId)!

  const say = useCallback((text: string) => {
    const id = Date.now()
    setToast({ id, text })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600)
  }, [])

  const update = (patch: Partial<PlaygroundState>) => setState((s) => ({ ...s, ...patch }))

  const item: ExplainedTime | null = useMemo(() => {
    if (!inspected) return null
    const day = computed.days.find((d) => d.date === inspected.date)
    return day?.explained?.find((e) => e.startMs === inspected.startMs) ?? null
  }, [computed, inspected])

  const spanAt = (t: number): Span | undefined => computed.bookingSpans.filter((s) => s.startMs <= t && t < s.endMs).at(-1)
  const itemSpan = item ? spanAt(item.startMs) : undefined
  const itemKind = item ? cellKind(item, !!itemSpan) : null

  const suggestions = useMemo(
    () => (item && !item.available ? suggestFor(state, item.startMs) : []),
    [item, state],
  )

  const book = (e: ExplainedTime) => {
    const label = PATIENTS[counter % PATIENTS.length]!
    setCounter((c) => c + 1)
    setState((s) => ({
      ...s,
      bookings: [...s.bookings, { id: `n${counter + 1}`, professionalId: s.proId, serviceId: s.serviceId, start: `${e.date}T${e.time}`, label }],
    }))
    say(`Agendado: ${label}, ${formatShortDate(e.date)} às ${e.time}.`)
  }

  const cancel = (e: ExplainedTime) => {
    const span = spanAt(e.startMs)
    if (!span) return
    setState((s) => ({
      ...s,
      bookings: s.bookings.flatMap((b) =>
        b.id !== span.booking.id ? [b] : b.seats && b.seats > 1 ? [{ ...b, seats: b.seats - 1 }] : [],
      ),
    }))
    say(`Cancelado: ${span.booking.label}.`)
  }

  const activate = (e: ExplainedTime, kind: string) => {
    setInspected({ date: e.date, startMs: e.startMs })
    if (!desktop) setSheet(true)
    if (kind === 'free') book(e)
    else if (kind === 'booked' && desktop) cancel(e)
  }

  const jump = (s: Slot) => {
    const monday = addDays(s.date, -((new Date(`${s.date}T12:00:00Z`).getUTCDay() + 6) % 7))
    if (monday !== state.weekStart) update({ weekStart: monday })
    setMobileDate(s.date)
    setInspected({ date: s.date, startMs: s.startMs })
    if (!desktop) setSheet(true)
  }

  const setPro = (id: string) => {
    const p = PROFESSIONALS.find((x) => x.id === id)!
    setInspected(null)
    update({ proId: id, serviceId: p.serviceIds.includes(state.serviceId) ? state.serviceId : p.serviceIds[0]! })
  }

  const setWeek = (delta: number) => {
    const weekStart = addDays(state.weekStart, delta * 7)
    update({ weekStart })
    setMobileDate(weekStart)
    setInspected(null)
  }

  const toggleDayOff = (date: string) =>
    setState((s) => {
      const list = s.daysOff[s.proId] ?? []
      const next = list.includes(date) ? list.filter((d) => d !== date) : [...list, date]
      return { ...s, daysOff: { ...s.daysOff, [s.proId]: next } }
    })

  const freeCount = computed.days.reduce((n, d) => n + d.slots.length, 0)

  const inspector = (
    <Inspector
      item={item}
      kind={itemKind}
      span={itemSpan}
      serviceName={service.name ?? service.id}
      suggestions={suggestions}
      next={computed.next}
      onBook={book}
      onCancel={cancel}
      onJump={jump}
    />
  )

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <a href="#" className="flex min-w-0 items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-mono text-[17px] font-semibold tracking-tight">agenda-slots</span>
          <span className="hidden truncate text-sm text-muted sm:inline">horários livres, com o porquê</span>
        </a>
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="hidden rounded-full border border-line bg-card px-2.5 py-1 text-xs text-muted md:inline">TypeScript · 0 dependências · ESM + CJS</span>
          <a href={`${REPO}#api`} className="hidden items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium hover:bg-card sm:inline-flex">
            API <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          <a href={REPO} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1.5 font-medium text-paper hover:bg-ink/90" aria-label="Código no GitHub">
            <Github className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-10 lg:px-6">
        <div className="mb-4 flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight lg:text-[32px]">
              Playground da <span className="italic text-cobalt">Clínica Maré Alta</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted">
              Mude o expediente, a duração e os intervalos. Clique num horário livre para agendar e passe o mouse em qualquer horário para ver o motivo.
            </p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Timer className="h-3.5 w-3.5" aria-hidden /> Agora simulado: seg, 16/11/2026 às {NOW.slice(11)} · America/Recife
          </p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[264px_minmax(0,1fr)_340px] lg:items-start">
          <aside aria-label="Ajustes" className="min-w-0 rounded-2xl border border-line bg-card p-4">
            <Controls
              state={state}
              hoursOpen={desktop}
              onPro={setPro}
              onService={(id) => {
                setInspected(null)
                update({ serviceId: id })
              }}
              onTuning={(patch) => setState((s) => ({ ...s, tuning: { ...s.tuning, [s.serviceId]: { ...s.tuning[s.serviceId]!, ...patch } } }))}
              onRules={(patch) => update(patch)}
              onHours={(day: Weekday, value: DayHours) =>
                setState((s) => ({ ...s, hours: { ...s.hours, [s.proId]: { ...s.hours[s.proId]!, [day]: value } } }))
              }
            />
          </aside>

          <section aria-label="Agenda da semana" className="min-w-0 rounded-2xl border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setWeek(-1)} aria-label="Semana anterior" className="rounded-md p-1.5 hover:bg-paper">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <h2 className="min-w-[10.5rem] text-center font-display text-[15px] font-semibold sm:text-base">{weekTitle(state.weekStart)}</h2>
                <button type="button" onClick={() => setWeek(1)} aria-label="Próxima semana" className="rounded-md p-1.5 hover:bg-paper">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  <span className="font-semibold text-ink">{pro.name}</span> · {service.name}
                </span>
                <span>
                  <span className="font-semibold text-cobalt">{freeCount}</span> livres
                </span>
                <span title="Tempo de createAgenda + slots + nextAvailable nesta semana">
                  calculado em <span className="font-mono text-ink">{computed.ms.toFixed(1).replace('.', ',')} ms</span>
                </span>
              </div>
            </div>

            {computed.error ? (
              <p role="alert" className="m-4 rounded-lg bg-coral/10 p-3 text-sm text-coral">
                {computed.error}
              </p>
            ) : (
              <div className="scroll-thin max-h-none overflow-y-auto px-2 pb-2 sm:px-3 lg:max-h-[640px]">
                <WeekGrid
                  days={computed.days}
                  spans={computed.bookingSpans}
                  stepMinutes={state.stepMinutes}
                  inspectedKey={item ? cellKey(item) : null}
                  daysOff={state.daysOff[state.proId] ?? []}
                  mobileDate={mobileDate}
                  onMobileDate={setMobileDate}
                  onInspect={(e) => setInspected({ date: e.date, startMs: e.startMs })}
                  onActivate={activate}
                  onToggleDayOff={toggleDayOff}
                />
              </div>
            )}

            <ul aria-label="Legenda" className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 text-[11px] text-muted sm:px-4">
              {LEGEND.map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <span className={`h-3 w-4 rounded-[3px] ${KIND_META[k].swatch}`} aria-hidden />
                  {KIND_META[k].label}
                </li>
              ))}
            </ul>
          </section>

          <aside aria-label="Explicação e código" className="min-w-0 space-y-4 lg:sticky lg:top-4">
            <div className="hidden rounded-2xl border border-line bg-card p-4 lg:block">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Por que sim, por que não</h2>
              {inspector}
            </div>
            <CodePanel code={code} />
          </aside>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between lg:px-6">
          <p>A Clínica Maré Alta, os profissionais e os pacientes são fictícios.</p>
          <p>
            Feito por{' '}
            <a className="font-medium text-ink underline decoration-line underline-offset-2" href="https://www.linkedin.com/in/joaoguilhermegr/">
              João Guilherme Gomes de Araújo
            </a>{' '}
            ·{' '}
            <a className="font-medium text-ink underline decoration-line underline-offset-2" href="https://clairix.enterprises/cases">
              ClairiX
            </a>
          </p>
        </div>
      </footer>

      {!desktop && sheet && item && (
        <div role="dialog" aria-label="Explicação do horário" className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-card p-4 shadow-[0_-12px_32px_-12px_rgba(22,33,62,.35)]">
          <Inspector
            item={item}
            kind={itemKind}
            span={itemSpan}
            serviceName={service.name ?? service.id}
            suggestions={suggestions}
            next={computed.next}
            onBook={book}
            onCancel={cancel}
            onJump={jump}
            onClose={() => setSheet(false)}
          />
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4">
        {toast && (
          <p key={toast.id} className="animate-pop rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-lg">
            {toast.text}
          </p>
        )}
      </div>
    </div>
  )
}
