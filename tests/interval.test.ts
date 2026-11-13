import { describe, expect, it } from 'vitest'
import {
  IntervalIndex,
  contains,
  expand,
  intersectIntervals,
  isValidInterval,
  maxConcurrency,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  totalDuration,
} from '../src'
import { rng } from './fixtures'

const i = (start: number, end: number) => ({ start, end })

describe('overlaps e contains', () => {
  it('intervalos que só se tocam não se sobrepõem', () => {
    expect(overlaps(i(0, 10), i(10, 20))).toBe(false)
    expect(overlaps(i(10, 20), i(0, 10))).toBe(false)
  })

  it('sobreposição parcial, total e interna', () => {
    expect(overlaps(i(0, 10), i(9, 20))).toBe(true)
    expect(overlaps(i(0, 10), i(0, 10))).toBe(true)
    expect(overlaps(i(0, 10), i(3, 4))).toBe(true)
  })

  it('contains aceita bordas iguais e recusa o que passa do limite', () => {
    expect(contains(i(0, 10), i(0, 10))).toBe(true)
    expect(contains(i(0, 10), i(5, 11))).toBe(false)
    expect(contains(i(0, 10), i(-1, 5))).toBe(false)
  })

  it('isValidInterval recusa vazio, invertido e não finito', () => {
    expect(isValidInterval(i(5, 5))).toBe(false)
    expect(isValidInterval(i(6, 5))).toBe(false)
    expect(isValidInterval(i(0, Infinity))).toBe(false)
    expect(isValidInterval(i(0, 1))).toBe(true)
  })
})

describe('mergeIntervals', () => {
  it('funde sobrepostos e encostados, ordena e ignora vazios', () => {
    expect(mergeIntervals([i(20, 30), i(0, 10), i(10, 15), i(5, 8), i(40, 40)])).toEqual([i(0, 15), i(20, 30)])
  })

  it('não altera a lista de entrada', () => {
    const input = [i(0, 10), i(5, 20)]
    mergeIntervals(input)
    expect(input).toEqual([i(0, 10), i(5, 20)])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('subtractIntervals', () => {
  it('abre um buraco no meio', () => {
    expect(subtractIntervals([i(0, 100)], [i(40, 60)])).toEqual([i(0, 40), i(60, 100)])
  })

  it('corta as pontas e ignora o que está fora', () => {
    expect(subtractIntervals([i(10, 50)], [i(0, 20), i(45, 70), i(80, 90)])).toEqual([i(20, 45)])
  })

  it('remove tudo quando a subtração cobre a base', () => {
    expect(subtractIntervals([i(10, 20), i(30, 40)], [i(0, 50)])).toEqual([])
  })

  it('um corte atravessa várias peças da base', () => {
    expect(subtractIntervals([i(0, 10), i(20, 30), i(40, 50)], [i(5, 45)])).toEqual([i(0, 5), i(45, 50)])
  })

  it('expediente menos agendamentos encostados deixa só o resto', () => {
    // 08:00-12:00 menos 08:00-09:00 e 09:00-09:30, em minutos
    expect(subtractIntervals([i(480, 720)], [i(480, 540), i(540, 570)])).toEqual([i(570, 720)])
  })
})

describe('intersectIntervals, totalDuration e expand', () => {
  it('interseção de duas agendas', () => {
    expect(intersectIntervals([i(0, 10), i(20, 30)], [i(5, 25)])).toEqual([i(5, 10), i(20, 25)])
    expect(intersectIntervals([i(0, 10)], [i(10, 20)])).toEqual([])
  })

  it('duração total não conta sobreposição duas vezes', () => {
    expect(totalDuration([i(0, 10), i(5, 15), i(20, 25)])).toBe(20)
  })

  it('expand aplica preparo e limpeza', () => {
    expect(expand(i(100, 200), 10, 15)).toEqual(i(90, 215))
  })
})

describe('maxConcurrency', () => {
  it('conta só o que acontece ao mesmo tempo dentro da janela', () => {
    const list = [i(0, 10), i(5, 15), i(8, 12), i(20, 30)]
    expect(maxConcurrency(list, i(0, 30))).toBe(3)
    expect(maxConcurrency(list, i(12, 30))).toBe(1)
    expect(maxConcurrency(list, i(30, 40))).toBe(0)
  })

  it('intervalos encostados não somam', () => {
    expect(maxConcurrency([i(0, 10), i(10, 20)], i(0, 20))).toBe(1)
  })
})

describe('IntervalIndex', () => {
  it('acha os itens que se sobrepõem, em ordem de início', () => {
    const idx = new IntervalIndex([i(50, 60), i(0, 100), i(10, 20), i(30, 40)])
    expect(idx.size).toBe(4)
    expect(idx.query(15, 35)).toEqual([i(0, 100), i(10, 20), i(30, 40)])
    expect(idx.query(20, 30)).toEqual([i(0, 100)])
    expect(idx.query(100, 200)).toEqual([])
  })

  it('confere com a busca ingênua em 500 consultas aleatórias', () => {
    const r = rng(42)
    const items = Array.from({ length: 200 }, () => {
      const s = r.int(0, 10_000)
      return i(s, s + r.int(1, 400))
    })
    const idx = new IntervalIndex(items)
    for (let k = 0; k < 500; k++) {
      const a = r.int(-100, 10_400)
      const b = a + r.int(1, 300)
      const expected = items.filter((x) => overlaps(x, i(a, b))).sort((x, y) => x.start - y.start || x.end - y.end)
      expect(idx.query(a, b)).toEqual(expected)
    }
  })
})
