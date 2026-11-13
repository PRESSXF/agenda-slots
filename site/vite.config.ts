import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O site importa a biblioteca direto do código-fonte, pelo mesmo nome que um usuário usaria.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { 'agenda-slots': fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
  css: { postcss: fileURLToPath(new URL('..', import.meta.url)) },
  build: { outDir: 'dist', emptyOutDir: true },
})
