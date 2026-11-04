import { dirname, isAbsolute, resolve, sep } from 'node:path'
import type { InvalidDirectoryErrorCode } from '@xmcl/runtime-api'

export function createBootstrapSession(
  validate: (path: string) => Promise<InvalidDirectoryErrorCode>,
  prepare: (path: string) => Promise<void>,
  activate: (path: string) => Promise<void>,
) {
  let target: string | undefined
  let pending: Promise<void> | undefined
  let committed = false
  return (value: unknown): Promise<void> => {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > 32767 ||
      Array.from(value).some((char) => char.charCodeAt(0) < 32) ||
      !isAbsolute(value)
    )
      return Promise.reject(new TypeError('Invalid bootstrap path'))
    const path = resolve(value)
    if (process.platform === 'win32') {
      const candidate = path.toLowerCase()
      const forbidden = [process.env.SystemRoot, dirname(process.execPath)]
        .filter((root): root is string => !!root)
        .map((root) => resolve(root).toLowerCase())
      if (forbidden.some((root) => candidate === root || candidate.startsWith(root + sep)))
        return Promise.reject(new TypeError('Invalid bootstrap path'))
    }
    if (target)
      return path === target ? pending! : Promise.reject(new Error('Bootstrap already in progress'))
    target = path
    pending = Promise.resolve()
      .then(() => validate(path))
      .then((code) => {
        if (code && code !== 'exists') throw new Error('Bootstrap directory rejected')
        return prepare(path)
      })
      .then(() => {
        committed = true
        return activate(path)
      })
      .catch((error) => {
        // Validation/persistence may be retried; an activated root can never be replaced in this session.
        if (!committed) {
          target = undefined
          pending = undefined
        }
        throw error
      })
    return pending
  }
}
