import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { highlight, type Token } from '../lib/snippet'

const COLORS: Record<Token['kind'], string> = {
  plain: 'text-[#d9dfee]',
  string: 'text-[#f2b880]',
  number: 'text-[#9fc2ff]',
  key: 'text-[#b9c6e4]',
  comment: 'text-[#8792ad] italic',
  keyword: 'text-[#ff9b85]',
  fn: 'text-[#8fd3ff]',
}

export function CodePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-night text-[#d9dfee] shadow-[0_1px_0_rgba(0,0,0,.04),0_12px_32px_-16px_rgba(22,33,62,.5)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-white">A chamada equivalente</p>
          <p className="text-[11px] text-[#9aa5c0]">Muda junto com os ajustes. É o mesmo código que roda nesta página.</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/10"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre tabIndex={0} aria-label="Código TypeScript equivalente" className="scroll-thin max-h-[26rem] overflow-auto px-4 py-3 font-mono text-[11.5px] leading-[1.6]">
        <code>
          {code.split('\n').map((line, i) => (
            <div key={i} className="whitespace-pre">
              {highlight(line).map((t, j) => (
                <span key={j} className={COLORS[t.kind]}>
                  {t.text}
                </span>
              ))}
              {line === '' ? ' ' : null}
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
