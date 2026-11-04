import { baseCompile } from '@intlify/message-compiler'
import { load } from 'js-yaml'
import type { Plugin } from 'vite'

export function compileMessages(value: unknown): unknown {
  if (typeof value === 'string') return baseCompile(value, { jit: true, location: false }).ast
  if (Array.isArray(value)) return value.map(compileMessages)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, compileMessages(child)]))
  return value
}

export function localeCompiler(): Plugin {
  return {
    name: 'launcher-locale-ast', enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.yaml')) return
      return { code: `export default ${JSON.stringify(compileMessages(load(source)))}`, map: null }
    },
  }
}
