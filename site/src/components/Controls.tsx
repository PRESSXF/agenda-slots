import { useId, type ReactNode } from 'react'
import { formatTime, type Weekday } from 'agenda-slots'
import { DAYS, PROFESSIONALS, SERVICES, type DayHours } from '../clinic'
import type { PlaygroundState, ServiceTuning } from '../lib/playground'

interface Props {
  state: PlaygroundState
  onPro: (id: string) => void
  onService: (id: string) => void
  onTuning: (patch: Partial<ServiceTuning>) => void
  onRules: (patch: Partial<Pick<PlaygroundState, 'stepMinutes' | 'minNoticeMinutes' | 'holidays'>>) => void
  onHours: (day: Weekday, value: DayHours) => void
  hoursOpen: boolean
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="border-t border-line pt-4 first:border-0 first:pt-0">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Stepper({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold text-ink">
          {value} {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[rgb(var(--cobalt))]"
      />
    </div>
  )
}

const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 30)

/** Mantém a faixa válida: começa até 23:30 e dura pelo menos 30 min. */
function fix(start: number, end: number, moved: 'start' | 'end'): [number, number] {
  if (moved === 'start') {
    const s = Math.min(start, 1410)
    return [s, Math.max(end, s + 30)]
  }
  const e = Math.max(end, 30)
  return [Math.min(start, e - 30), e]
}

function TimeSelect({ value, onChange, label, disabled }: { value: number; onChange: (v: number) => void; label: string; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 w-full min-w-0 rounded-md border border-line bg-card px-1.5 font-mono text-xs disabled:opacity-40"
    >
      {TIME_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {formatTime(m)}
        </option>
      ))}
    </select>
  )
}

export function Controls({ state, onPro, onService, onTuning, onRules, onHours, hoursOpen }: Props) {
  const pro = PROFESSIONALS.find((p) => p.id === state.proId)!
  const services = SERVICES.filter((s) => pro.serviceIds.includes(s.id))
  const service = SERVICES.find((s) => s.id === state.serviceId)!
  const tuning = state.tuning[state.serviceId]!
  const hours = state.hours[state.proId]!
  const serviceSelect = useId()
  const noticeSelect = useId()

  return (
    <div className="space-y-4">
      <Section title="Profissional">
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-1">
          {PROFESSIONALS.map((p) => {
            const sel = p.id === state.proId
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={sel}
                onClick={() => onPro(p.id)}
                className={`flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition ${
                  sel ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink/40'
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${sel ? 'bg-paper text-ink' : 'bg-sky text-cobalt'}`}
                  aria-hidden
                >
                  {p.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight">{p.name.split(' ')[0]}<span className="hidden lg:inline"> {p.name.split(' ')[1]}</span></span>
                  <span className={`hidden truncate text-[11px] lg:block ${sel ? 'text-paper/70' : 'text-muted'}`}>{p.role}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Serviço">
        <label htmlFor={serviceSelect} className="sr-only">
          Serviço
        </label>
        <select
          id={serviceSelect}
          value={state.serviceId}
          onChange={(e) => onService(e.target.value)}
          className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm font-medium"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">
          {service.resourceIds?.length ? `Usa ${service.resourceIds.map((r) => (r === 'laser' ? 'o aparelho de laser' : 'o estúdio')).join(' e ')}. ` : ''}
          {service.capacity && service.capacity > 1 ? `Turma de até ${service.capacity} pessoas.` : ''}
        </p>
        <div className="mt-3 space-y-3">
          <Stepper label="Duração" unit="min" value={tuning.durationMinutes} min={10} max={120} step={5} onChange={(v) => onTuning({ durationMinutes: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Preparo antes" unit="min" value={tuning.bufferBeforeMinutes} min={0} max={30} step={5} onChange={(v) => onTuning({ bufferBeforeMinutes: v })} />
            <Stepper label="Limpeza depois" unit="min" value={tuning.bufferAfterMinutes} min={0} max={30} step={5} onChange={(v) => onTuning({ bufferAfterMinutes: v })} />
          </div>
        </div>
      </Section>

      <Section title="Regras da agenda">
        <div role="radiogroup" aria-label="Passo entre horários" className="grid grid-cols-5 gap-1 rounded-lg bg-paper p-1">
          {[10, 15, 20, 30, 60].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state.stepMinutes === s}
              onClick={() => onRules({ stepMinutes: s })}
              className={`rounded-md py-1 font-mono text-xs transition ${state.stepMinutes === s ? 'bg-card font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {s}′
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Passo entre inícios de horário</p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor={noticeSelect} className="text-sm">
            Antecedência mínima
          </label>
          <select
            id={noticeSelect}
            value={state.minNoticeMinutes}
            onChange={(e) => onRules({ minNoticeMinutes: Number(e.target.value) })}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
          >
            <option value={0}>nenhuma</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={1440}>24 horas</option>
          </select>
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm">
            Feriados nacionais
            <span className="block font-mono text-[10.5px] text-muted">brazilianHolidaysBetween()</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={state.holidays}
            onChange={(e) => onRules({ holidays: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-6 w-10 shrink-0 rounded-full bg-line transition peer-checked:bg-cobalt peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cobalt after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
          />
        </label>
      </Section>

      <Section title={`Expediente de ${pro.name.split(' ')[0]}`}>
        <details open={hoursOpen} className="group">
          <summary className="cursor-pointer list-none text-xs text-muted marker:hidden">
            <span className="underline decoration-line underline-offset-4 group-open:hidden">Mostrar as faixas por dia</span>
            <span className="hidden underline decoration-line underline-offset-4 group-open:inline">Esconder as faixas</span>
          </summary>
          <div className="mt-2 space-y-1.5">
            {DAYS.map((d) => {
              const day = hours[d.id]
              const r1 = day.ranges[0] ?? [480, 720]
              const r2 = day.ranges[1]
              const set = (ranges: [number, number][]) => onHours(d.id, { ...day, ranges })
              return (
                <div key={d.id} className="grid grid-cols-[2.9rem_minmax(0,1fr)] items-start gap-2">
                  <label className="flex h-7 items-center gap-1.5 text-xs font-medium">
                    <input type="checkbox" checked={day.on} onChange={(e) => onHours(d.id, { ...day, on: e.target.checked })} className="accent-[rgb(var(--cobalt))]" />
                    {d.short}
                  </label>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.75rem] items-center gap-1">
                      <TimeSelect label={`${d.long}, início da 1ª faixa`} value={r1[0]} disabled={!day.on} onChange={(v) => set([fix(v, r1[1], 'start'), ...(r2 ? [r2] : [])])} />
                      <TimeSelect label={`${d.long}, fim da 1ª faixa`} value={r1[1]} disabled={!day.on} onChange={(v) => set([fix(r1[0], v, 'end'), ...(r2 ? [r2] : [])])} />
                      <button
                        type="button"
                        disabled={!day.on}
                        onClick={() => set(r2 ? [r1] : [r1, fix(Math.min(r1[1] + 120, 1380), Math.min(r1[1] + 360, 1440), 'start')])}
                        aria-label={r2 ? `Remover 2ª faixa de ${d.long}` : `Adicionar 2ª faixa em ${d.long}`}
                        title={r2 ? 'Remover 2ª faixa' : 'Adicionar 2ª faixa'}
                        className="h-7 w-7 rounded-md text-sm font-semibold text-muted hover:bg-paper hover:text-ink disabled:opacity-40"
                      >
                        {r2 ? '−' : '+'}
                      </button>
                    </div>
                    {r2 && day.on && (
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.75rem] items-center gap-1">
                        <TimeSelect label={`${d.long}, início da 2ª faixa`} value={r2[0]} onChange={(v) => set([r1, fix(v, r2[1], 'start')])} />
                        <TimeSelect label={`${d.long}, fim da 2ª faixa`} value={r2[1]} onChange={(v) => set([r1, fix(r2[0], v, 'end')])} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      </Section>
    </div>
  )
}
