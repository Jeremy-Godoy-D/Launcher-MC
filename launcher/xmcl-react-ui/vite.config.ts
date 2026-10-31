import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { localeCompiler } from './i18n-compiler.ts'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  base: './',
  plugins: [localeCompiler(), react()],
  define: { __INTLIFY_DROP_MESSAGE_COMPILER__: true },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rolldownOptions: {
      input: ['index', 'logger', 'migration'].map((name) =>
        resolve(import.meta.dirname, 'src', `${name}.html`),
      ),
    },
  },
})
