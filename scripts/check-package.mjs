// Confere o pacote antes de publicar: conteúdo do tarball e importação em ESM e CommonJS.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

if (!existsSync('dist/index.js')) fail('dist/ não existe. Rode "npm run build:lib" antes.')

const [pack] = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const files = pack.files.map((f) => f.path).sort()
const allowed = (p) => p.startsWith('dist/') || ['README.md', 'LICENSE', 'package.json'].includes(p)
const extra = files.filter((p) => !allowed(p))
if (extra.length) fail(`arquivos fora do esperado no pacote: ${extra.join(', ')}`)
for (const need of ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts', 'README.md', 'LICENSE']) {
  if (!files.includes(need)) fail(`faltou ${need} no pacote`)
}
console.log(`✓ pacote com ${files.length} arquivos, ${(pack.size / 1024).toFixed(1)} kB compactado`)
for (const f of files) console.log(`  ${f}`)

const config = {
  professionals: [{ id: 'ana', weeklyHours: { mon: ['08:00-10:00'] } }],
  services: [{ id: 'consulta', durationMinutes: 30 }],
  stepMinutes: 30,
}
const query = { serviceId: 'consulta', from: '2026-11-16', now: '2026-11-15T12:00:00-03:00' }

const esm = await import('../dist/index.js')
const cjs = createRequire(import.meta.url)('../dist/index.cjs')
const a = esm.getAvailableSlots(config, query)[0].slots.map((s) => s.time).join(' ')
const b = cjs.getAvailableSlots(config, query)[0].slots.map((s) => s.time).join(' ')
if (a !== '08:00 08:30 09:00 09:30' || a !== b) fail(`ESM e CJS divergem: "${a}" / "${b}"`)
console.log(`✓ ESM e CommonJS importam e calculam igual: ${a}`)
