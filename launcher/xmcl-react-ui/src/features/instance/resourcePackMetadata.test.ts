import { expect, it } from 'vitest'
import { resourcePackDescription, resourcePackFormat } from './resourcePackMetadata'

it('accepts declared numeric formats and rejects object/prototype keys or invalid numbers', () => {
  expect(resourcePackFormat(34)).toBe(34)
  for (const value of ['__proto__', 'toString', { format: 34 }, null, -1, NaN, 1.5, Infinity]) expect(resourcePackFormat(value)).toBeUndefined()
})

it('reads plain and nested pack text without executing HTML or Minecraft actions', () => {
  expect(resourcePackDescription({ text: '§aHello ', extra: [{ text: '<img src=x onerror=attack()>', clickEvent: { action: 'run_command', value: 'ignored' } }, ['!', { text: ' World' }]] })).toEqual({ text: 'Hello <img src=x onerror=attack()>! World', truncated: false })
  expect(resourcePackDescription('Plain\ntext').text).toBe('Plain\ntext')
  expect(resourcePackDescription({ translate: 'pack.description', with: ['unresolved'], extra: ['!'] }).text).toBe('pack.description!')
  expect(resourcePackDescription({ clickEvent: { value: 'not display text' } }).text).toBe('')
  expect(resourcePackDescription(null)).toEqual({ text: '', truncated: false })
})
it('bounds long, wide, deep and cyclic metadata without hiding that the display was shortened', () => {
  expect(resourcePackDescription('x'.repeat(32769))).toEqual({ text: 'x'.repeat(32768), truncated: true })
  expect(resourcePackDescription(Array.from({ length: 3000 }, () => 'x')).truncated).toBe(true)
  const node: any = { text: 'x', extra: [] }; node.extra.push(node)
  expect(resourcePackDescription(node).truncated).toBe(true)
  expect(resourcePackDescription('x'.repeat(32768)).truncated).toBe(false)
})
