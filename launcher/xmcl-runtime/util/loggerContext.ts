import type { LoggerContext } from '@xmcl/runtime-api/src/controller'
import { isAbsolute } from 'node:path'
import { importPathParts } from './importFile'

export function loggerContext(instancePath: unknown, source: unknown = '__live__'): LoggerContext {
  if (typeof instancePath !== 'string' || instancePath.length > 32768 || instancePath.includes('\0') || !isAbsolute(instancePath) || typeof source !== 'string') throw new Error('Invalid logger context')
  if (source !== '__live__') {
    const prefix = source.startsWith('log:') ? 4 : source.startsWith('crash:') ? 6 : 0
    if (!prefix || source.length > 261 || importPathParts(source.slice(prefix)).length !== 1) throw new Error('Invalid logger source')
  }
  return Object.freeze({ instancePath, source })
}
