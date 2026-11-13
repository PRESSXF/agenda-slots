import type { AgendaConfig, Professional, Service } from '../src'

export const NOW = '2026-11-15T12:00:00-03:00' // domingo, antes da semana de teste

export const ana: Professional = {
  id: 'ana',
  name: 'Ana',
  weeklyHours: {
    mon: ['08:00-12:00', '14:00-18:00'],
    tue: ['08:00-12:00', '14:00-18:00'],
    wed: ['08:00-12:00'],
    thu: ['08:00-12:00', '14:00-18:00'],
    fri: ['08:00-12:00', '14:00-18:00'],
    sat: ['08:00-12:00'],
  },
}

export const consulta: Service = { id: 'consulta', name: 'Consulta', durationMinutes: 30 }

export function base(overrides: Partial<AgendaConfig> = {}): AgendaConfig {
  return {
    professionals: [ana],
    services: [consulta],
    stepMinutes: 30,
    ...overrides,
  }
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
  }
}
