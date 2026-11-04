import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { localeCompiler } from './i18n-compiler.ts'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  base: './',
  plugins: [localeCompiler(), react(), {
    name: 'distribution-graph',
    generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? Object.entries(chunk.modules).filter(([, module]) => module.renderedLength > 0).map(([id, module]) => ({ id, bytes: module.renderedLength })) : [])
      this.emitFile({ type: 'asset', fileName: 'distribution-graph.json', source: JSON.stringify({ modules }, null, 2) })
    },
  }],
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
