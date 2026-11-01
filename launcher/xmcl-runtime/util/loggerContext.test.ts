import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { loggerContext } from './loggerContext'

it('captures an absolute instance and a bounded portable log selection', () => {
  const path = resolve('owned-instance')
  expect(loggerContext(path)).toEqual({ instancePath: path, source: '__live__' })
  for (const source of ['log:latest.log', 'log:archive.log.gz', 'crash:crash-report.txt']) {
    const context = loggerContext(path, source)
    expect(context).toEqual({ instancePath: path, source }); expect(Object.isFrozen(context)).toBe(true)
  }
})
it('rejects path, source and component ambiguity before a window can open', () => {
  for (const path of [undefined, 'relative', 'x'.repeat(32769), resolve('with\0nul')]) expect(() => loggerContext(path)).toThrow()
  for (const source of ['file:///secret', 'log:../secret', 'log:a/b.log', 'log:a\\b.log', 'log:CON.log', 'log:', 'crash:../../secret', 'log:' + 'x'.repeat(258), null]) expect(() => loggerContext(resolve('owned'), source)).toThrow()
})
