import { expect, it } from 'vitest'
import { MAX_CONSOLE_LINE, MAX_CONSOLE_LINES, MAX_CONSOLE_TEXT, parseLogFile } from './consoleLog'

it('preserves blank lines, whitespace and CR/LF without inventing a trailing line', () => {
  const view = parseLogFile('first\r\n\r\n \nlast\r')
  expect(view.entries.map(entry => entry.raw)).toEqual(['first', '', ' ', 'last'])
  expect(view.limited).toBe(false)
  expect(parseLogFile('').entries).toEqual([])
  expect(parseLogFile('\n').entries.map(entry => entry.raw)).toEqual([''])
})
it('limits a large number of short lines before constructing more entries', () => {
  const view = parseLogFile('line\n'.repeat(MAX_CONSOLE_LINES + 50000))
  expect(view.entries).toHaveLength(MAX_CONSOLE_LINES); expect(view.limited).toBe(true)
  expect(parseLogFile('line\n'.repeat(MAX_CONSOLE_LINES)).limited).toBe(false)
})
it('bounds a very long line and keeps Unicode pairs intact at its boundary', () => {
  const view = parseLogFile('a'.repeat(MAX_CONSOLE_LINE - 1) + '🧙more')
  expect(view.entries).toHaveLength(1); expect(view.entries[0].raw).toBe('a'.repeat(MAX_CONSOLE_LINE - 1)); expect(view.limited).toBe(true)
})
it('bounds total display text even when the file fits within the line-count budget', () => {
  const view = parseLogFile(('x'.repeat(1023) + '\n').repeat(2000))
  expect(view.entries.reduce((size, entry) => size + entry.raw.length, 0)).toBeLessThanOrEqual(MAX_CONSOLE_TEXT)
  expect(view.entries).toHaveLength(1024); expect(view.limited).toBe(true)
})
it('keeps formatted metadata and default crash levels in the bounded view', () => {
  const view = parseLogFile('[12:00:00] [main/WARN]: warning\nstack frame\n', 'error')
  expect(view.entries[0]).toMatchObject({ timestamp: '12:00:00', source: 'main', level: 'warn', text: 'warning' })
  expect(view.entries[1]).toMatchObject({ level: 'error', raw: 'stack frame' })
  expect(view.limited).toBe(false)
})
