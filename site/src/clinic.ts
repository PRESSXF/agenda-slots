import type { Booking, Resource, Service, Weekday } from 'agenda-slots'

/** Dados fictícios da Clínica Maré Alta (fisioterapia e pilates, Recife). */

export const TIME_ZONE = 'America/Recife'
/** "Agora" fixo, para a demo ser igual para todo mundo. */
export const NOW = '2026-11-16T09:10'
export const FIRST_WEEK = '2026-11-16'

export const DAYS: { id: Weekday; short: string; long: string }[] = [
  { id: 'mon', short: 'seg', long: 'segunda' },
  { id: 'tue', short: 'ter', long: 'terça' },
  { id: 'wed', short: 'qua', long: 'quarta' },
  { id: 'thu', short: 'qui', long: 'quinta' },
  { id: 'fri', short: 'sex', long: 'sexta' },
  { id: 'sat', short: 'sáb', long: 'sábado' },
  { id: 'sun', short: 'dom', long: 'domingo' },
]

/** Expediente editável: até duas faixas por dia, em minutos. */
export type DayHours = { on: boolean; ranges: [number, number][] }
export type HoursState = Record<Weekday, DayHours>

export interface ClinicPro {
  id: string
  name: string
  role: string
  initials: string
  serviceIds: string[]
  hours: HoursState
}

const h = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const day = (...ranges: string[]): DayHours =>
  ranges.length === 0 ? { on: false, ranges: [[h('08:00'), h('12:00')]] } : { on: true, ranges: ranges.map((r) => [h(r.slice(0, 5)), h(r.slice(6))]) }

export const PROFESSIONALS: ClinicPro[] = [
  {
    id: 'helena',
    name: 'Helena Duarte',
    role: 'Fisioterapeuta',
    initials: 'HD',
    serviceIds: ['avaliacao', 'fisio', 'laser'],
    hours: {
      mon: day('08:00-12:00', '14:00-18:00'),
      tue: day('08:00-12:00', '14:00-18:00'),
      wed: day('08:00-12:00'),
      thu: day('08:00-12:00', '14:00-18:00'),
      fri: day('08:00-12:00', '14:00-18:00'),
      sat: day('08:00-12:00'),
      sun: day(),
    },
  },
  {
    id: 'rafael',
    name: 'Rafael Lins',
    role: 'Fisioterapeuta',
    initials: 'RL',
    serviceIds: ['avaliacao', 'fisio', 'laser'],
    hours: {
      mon: day('07:00-12:00'),
      tue: day('13:00-19:00'),
      wed: day('07:00-12:00'),
      thu: day('13:00-19:00'),
      fri: day('07:00-12:00', '13:00-16:00'),
      sat: day(),
      sun: day(),
    },
  },
  {
    id: 'marina',
    name: 'Marina Teles',
    role: 'Instrutora de pilates',
    initials: 'MT',
    serviceIds: ['pilates'],
    hours: {
      mon: day('07:00-10:00', '17:00-20:00'),
      tue: day('07:00-10:00', '17:00-20:00'),
      wed: day('07:00-10:00', '17:00-20:00'),
      thu: day('07:00-10:00', '17:00-20:00'),
      fri: day('07:00-10:00'),
      sat: day('08:00-11:00'),
      sun: day(),
    },
  },
]

export const SERVICES: Service[] = [
  { id: 'avaliacao', name: 'Avaliação inicial', durationMinutes: 50, bufferAfterMinutes: 10 },
  { id: 'fisio', name: 'Sessão de fisioterapia', durationMinutes: 40, bufferBeforeMinutes: 5, bufferAfterMinutes: 10 },
  { id: 'laser', name: 'Laserterapia', durationMinutes: 20, bufferAfterMinutes: 5, resourceIds: ['laser'] },
  { id: 'pilates', name: 'Pilates em turma', durationMinutes: 55, bufferAfterMinutes: 5, capacity: 4, resourceIds: ['estudio'] },
]

export const RESOURCES: Resource[] = [
  { id: 'laser', name: 'Aparelho de laser' },
  { id: 'estudio', name: 'Estúdio de pilates' },
]

export const PATIENTS = [
  'Joana Albuquerque',
  'Caio Menezes',
  'Lívia Barros',
  'Otávio Siqueira',
  'Bruna Cavalcanti',
  'Diego Farias',
  'Tereza Lacerda',
  'Igor Montenegro',
  'Paula Queiroz',
  'Nando Ribeiro',
]

const b = (id: string, professionalId: string, serviceId: string, start: string, label: string, seats?: number): Booking => ({
  id,
  professionalId,
  serviceId,
  start,
  label,
  ...(seats ? { seats } : {}),
})

export const INITIAL_BOOKINGS: Booking[] = [
  b('b1', 'helena', 'fisio', '2026-11-16T14:00', 'Joana Albuquerque'),
  b('b2', 'helena', 'avaliacao', '2026-11-16T15:30', 'Caio Menezes'),
  b('b3', 'helena', 'fisio', '2026-11-17T08:30', 'Lívia Barros'),
  b('b4', 'helena', 'laser', '2026-11-17T10:00', 'Otávio Siqueira'),
  b('b5', 'helena', 'fisio', '2026-11-18T09:00', 'Bruna Cavalcanti'),
  b('b6', 'helena', 'fisio', '2026-11-19T16:00', 'Diego Farias'),
  b('b7', 'rafael', 'laser', '2026-11-16T10:00', 'Tereza Lacerda'),
  b('b8', 'rafael', 'laser', '2026-11-17T15:00', 'Igor Montenegro'),
  b('b9', 'rafael', 'laser', '2026-11-19T14:30', 'Paula Queiroz'),
  b('b10', 'rafael', 'fisio', '2026-11-18T08:00', 'Nando Ribeiro'),
  b('b11', 'marina', 'pilates', '2026-11-16T18:00', 'Turma das 18h', 4),
  b('b12', 'marina', 'pilates', '2026-11-17T07:00', 'Turma das 7h', 2),
  b('b13', 'marina', 'pilates', '2026-11-18T18:00', 'Turma das 18h', 3),
]
