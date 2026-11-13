/**
 * Intervalos semiabertos `[start, end)` em números (milissegundos desde a época ou minutos do dia).
 *
 * Semiaberto significa que `end` não pertence ao intervalo: 08:00-09:00 e 09:00-10:00 se tocam,
 * mas não se sobrepõem. É isso que permite encaixar um atendimento logo depois do outro.
 */
export interface Interval {
  start: number
  end: number
}

/** `true` quando o intervalo tem duração positiva. */
export function isValidInterval(i: Interval): boolean {
  return Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start
}

/** `true` quando os intervalos têm algum instante em comum. Encostar não conta. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** `true` quando `inner` cabe inteiro dentro de `outer`. */
export function contains(outer: Interval, inner: Interval): boolean {
  return inner.start >= outer.start && inner.end <= outer.end
}

/**
 * Ordena e funde intervalos que se sobrepõem ou se tocam. Ignora intervalos vazios.
 * O(n log n).
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter(isValidInterval).sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Interval[] = []
  for (const cur of sorted) {
    const last = out[out.length - 1]
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end
    } else {
      out.push({ start: cur.start, end: cur.end })
    }
  }
  return out
}

/**
 * Remove de `base` tudo o que estiver em `remove`. Os dois lados são normalizados antes.
 * Varredura linear sobre as listas ordenadas: O((n + m) log(n + m)).
 */
export function subtractIntervals(base: readonly Interval[], remove: readonly Interval[]): Interval[] {
  const a = mergeIntervals(base)
  const b = mergeIntervals(remove)
  const out: Interval[] = []
  let j = 0
  for (const piece of a) {
    let cursor = piece.start
    while (j < b.length && b[j]!.end <= cursor) j++
    let k = j
    while (k < b.length && b[k]!.start < piece.end) {
      const cut = b[k]!
      if (cut.start > cursor) out.push({ start: cursor, end: cut.start })
      if (cut.end > cursor) cursor = cut.end
      if (cursor >= piece.end) break
      k++
    }
    if (cursor < piece.end) out.push({ start: cursor, end: piece.end })
  }
  return out
}

/** Partes comuns às duas listas. O((n + m) log(n + m)). */
export function intersectIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const x = mergeIntervals(a)
  const y = mergeIntervals(b)
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    const p = x[i]!
    const q = y[j]!
    const start = Math.max(p.start, q.start)
    const end = Math.min(p.end, q.end)
    if (start < end) out.push({ start, end })
    if (p.end < q.end) i++
    else j++
  }
  return out
}

/** Soma das durações depois de fundir as sobreposições. */
export function totalDuration(intervals: readonly Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0)
}

/** Expande um intervalo para os dois lados (usado para os intervalos de preparo e limpeza). */
export function expand(i: Interval, before: number, after: number): Interval {
  return { start: i.start - before, end: i.end + after }
}

/**
 * Maior número de intervalos simultâneos dentro de `window`, por varredura de eventos.
 * Usado para recursos com capacidade maior que 1 (duas macas, três bicicletas).
 * O(k log k), com k = intervalos que tocam a janela.
 */
export function maxConcurrency(intervals: readonly Interval[], window: Interval): number {
  const events: Array<[number, number]> = []
  for (const i of intervals) {
    const start = Math.max(i.start, window.start)
    const end = Math.min(i.end, window.end)
    if (start < end) {
      events.push([start, 1], [end, -1])
    }
  }
  // Fim antes de início no mesmo instante: intervalos que só se tocam não contam como simultâneos.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cur = 0
  let max = 0
  for (const [, delta] of events) {
    cur += delta
    if (cur > max) max = cur
  }
  return max
}

/**
 * Índice estático para a pergunta "quais intervalos se sobrepõem a [a, b)?".
 *
 * Os itens ficam ordenados pelo início, com o maior fim acumulado (prefix max). A busca binária
 * acha o último item que começa antes de `b`; daí voltamos enquanto o maior fim acumulado ainda
 * passa de `a`. Custo O(log n + itens visitados), sem estrutura de árvore.
 */
export class IntervalIndex<T extends Interval> {
  private readonly items: T[]
  private readonly maxEnd: number[]

  constructor(items: readonly T[]) {
    this.items = [...items].sort((x, y) => x.start - y.start || x.end - y.end)
    this.maxEnd = []
    let m = -Infinity
    for (const it of this.items) {
      m = Math.max(m, it.end)
      this.maxEnd.push(m)
    }
  }

  get size(): number {
    return this.items.length
  }

  /** Itens que se sobrepõem a `[start, end)`, em ordem de início. */
  query(start: number, end: number): T[] {
    // primeiro índice com item.start >= end
    let lo = 0
    let hi = this.items.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.items[mid]!.start < end) lo = mid + 1
      else hi = mid
    }
    const found: T[] = []
    for (let i = lo - 1; i >= 0 && this.maxEnd[i]! > start; i--) {
      const it = this.items[i]!
      if (it.end > start) found.push(it)
    }
    return found.reverse()
  }
}
