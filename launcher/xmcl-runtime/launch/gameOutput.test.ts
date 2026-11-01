import { expect, it, vi } from 'vitest'
import { PassThrough, Readable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import { appendGameOutput, consumeGameOutput, MAX_GAME_OUTPUT_UNITS } from './gameOutput'

it('keeps ASCII followed by UTF8 characters split at every byte in order', async () => {
  const text = 'Starting...\ncafé 漢字 😀\n', bytes = Buffer.from(text), chunks: string[] = [], guess = vi.fn()
  await consumeGameOutput(Readable.from([...bytes].map(byte => Buffer.from([byte]))), guess, text => chunks.push(text))
  expect(chunks.join('')).toBe(text); expect(guess).not.toHaveBeenCalled()
})
it('does not lock an ASCII prelude into ASCII when a legacy byte follows', async () => {
  const chunks: string[] = [], guess = vi.fn(async () => 'windows1252')
  await consumeGameOutput(Readable.from([Buffer.from('ready\ncaf'), Buffer.from([0xe9]), Buffer.from('\n')]), guess, text => chunks.push(text))
  expect(chunks.join('')).toBe('ready\ncafé\n'); expect(guess).toHaveBeenCalledOnce()
})
it.each(['utf8', 'utf16le', 'utf16be'])('handles a split %s BOM with one decoder', async encoding => {
  const raw = Buffer.from('café 😀', 'utf16le'), bytes = encoding === 'utf8' ? Buffer.from('\ufeffcafé 😀') : Buffer.concat([Buffer.from(encoding === 'utf16le' ? [0xff, 0xfe] : [0xfe, 0xff]), encoding === 'utf16be' ? raw.swap16() : raw])
  const chunks: string[] = [], guess = vi.fn()
  await consumeGameOutput(Readable.from([...bytes].map(byte => Buffer.from([byte]))), guess, text => chunks.push(text))
  expect(chunks.join('')).toBe('café 😀'); expect(guess).not.toHaveBeenCalled()
})
it('preserves an embedded UTF8 BOM after an ASCII prefix', async () => {
  const chunks: string[] = []
  await consumeGameOutput(Readable.from([Buffer.from('prefix'), Buffer.from('\ufeffsuffix')]), vi.fn(), text => chunks.push(text))
  expect(chunks.join('')).toBe('prefix\ufeffsuffix')
})
it.each(['unknown', 'ascii', 'reject', null])('falls back safely when the detector returns %s', async encoding => {
  const chunks: string[] = [], guess = vi.fn(async () => { if (encoding === 'reject') throw new Error('detector failed'); return encoding })
  await consumeGameOutput(Readable.from([Buffer.from([0xff])]), guess, text => chunks.push(text))
  expect(chunks.join('')).toBe('�'); expect(guess).toHaveBeenCalledOnce()
})
it('flushes a trailing incomplete UTF8 sequence once after valid Unicode output', async () => {
  const chunks: string[] = []
  await consumeGameOutput(Readable.from([Buffer.from('é'), Buffer.from([0xf0, 0x9f])]), vi.fn(), text => chunks.push(text))
  expect(chunks.join('')).toBe('é�')
})
it('keeps both pipes independent while a legacy detector is waiting', async () => {
  const gate = Promise.withResolvers<string>(), entered = Promise.withResolvers<void>(), out: string[] = [], err: string[] = []
  const pending = consumeGameOutput(Readable.from([Buffer.from([0xe9]), Buffer.from('!')]), () => { entered.resolve(); return gate.promise }, text => err.push(text))
  try {
    await entered.promise
    await consumeGameOutput(Readable.from([Buffer.from('stdout 漢字')]), vi.fn(), text => out.push(text))
    expect(out.join('')).toBe('stdout 漢字'); expect(err).toEqual([])
  } finally { gate.resolve('windows1252'); await pending }
  expect(err.join('')).toBe('é!')
})
it('applies pipe backpressure instead of keeping an array of pending decode promises', async () => {
  const gate = Promise.withResolvers<string>(), entered = Promise.withResolvers<void>()
  let generated = 0, units = 0
  const source = new Readable({ highWaterMark: 65536, read() { if (generated++ < 128) this.push(Buffer.alloc(65536, 0xe9)); else this.push(null) } })
  const guess = vi.fn(() => { entered.resolve(); return gate.promise })
  const pending = consumeGameOutput(source, guess, text => { units += text.length; expect(text[0]).toBe('é') })
  try {
    await entered.promise; await setImmediate()
    expect(generated).toBeLessThanOrEqual(3); expect(units).toBe(0)
  } finally { gate.resolve('windows1252'); await pending }
  expect(units).toBe(128 * 65536); expect(guess).toHaveBeenCalledOnce()
})
it('publishes finite chunks without splitting surrogate pairs', async () => {
  const text = '😀'.repeat(150000), chunks: string[] = []
  await consumeGameOutput(Readable.from([Buffer.from(text)]), vi.fn(), text => chunks.push(text))
  expect(chunks.join('')).toBe(text)
  for (const chunk of chunks) { expect(chunk.length).toBeLessThanOrEqual(65536); expect(chunk.charCodeAt(0)).not.toBeGreaterThanOrEqual(0xdc00); expect(chunk.charCodeAt(chunk.length - 1)).toBeGreaterThanOrEqual(0xdc00) }
})
it('rejects pipe and callback failures and closes the affected pipe', async () => {
  const source = new PassThrough(), pending = consumeGameOutput(source, vi.fn(), () => {})
  source.destroy(new Error('pipe failed'))
  await expect(pending).rejects.toThrow('pipe failed')
  const next = Readable.from([Buffer.from('output')])
  await expect(consumeGameOutput(next, vi.fn(), () => { throw new Error('callback failed') })).rejects.toThrow('callback failed')
  expect(next.destroyed).toBe(true)
})
it('keeps a marked finite tail for each capture without splitting a code point', () => {
  const result = appendGameOutput('', '😀'.repeat(MAX_GAME_OUTPUT_UNITS) + 'x')
  expect(result.length).toBeLessThanOrEqual(MAX_GAME_OUTPUT_UNITS)
  expect(result).toMatch(/^\[earlier output truncated\]\n/)
  const tail = result.slice(result.indexOf('\n') + 1)
  expect(tail.charCodeAt(0)).toBeLessThan(0xdc00); expect(result.endsWith('x')).toBe(true)
  expect(appendGameOutput(result, 'y').length).toBeLessThanOrEqual(MAX_GAME_OUTPUT_UNITS)
  expect(appendGameOutput('one', 'two')).toBe('onetwo')
})
it('accepts an absent pipe without inventing output', async () => {
  const accept = vi.fn(); await consumeGameOutput(undefined, vi.fn(), accept); expect(accept).not.toHaveBeenCalled()
})
