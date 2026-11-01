import { describe, expect, it } from 'vitest'
import { GameLogBuffer, type GameIdentity } from './gameLogs'
import { MAX_CONSOLE_LINE, MAX_CONSOLE_LINES, MAX_CONSOLE_TEXT } from '../instance/consoleLog'

const identity: GameIdentity = { pid: 42, launchId: 'one', gameDirectory: '/qa/one', side: 'client' }
const output = (buffer: GameLogBuffer, sequence: number, text: string, channel: 'stdout' | 'stderr' = 'stdout', id = identity) => buffer.output({ ...id, sequence }, channel, text)
const raw = (buffer: GameLogBuffer) => buffer.snapshot().entries.filter(entry => !entry.system).map(entry => entry.raw)

describe('window game log budget and incremental lines', () => {
  it('assembles split lines and CRLF, keeps spaces, blank lines and a final partial line', () => {
    const buffer = new GameLogBuffer()
    output(buffer, 1, '[12:34:56] [main/IN')
    const first = buffer.snapshot().entries[0]
    output(buffer, 2, 'FO]: café 😀\r')
    output(buffer, 3, '\n\n  \r\ntail')
    const snapshot = buffer.snapshot()
    expect(raw(buffer)).toEqual(['[12:34:56] [main/INFO]: café 😀', '', '  ', 'tail'])
    expect(snapshot.entries[0]).toMatchObject({ id: first.id, timestamp: '12:34:56', source: 'main', level: 'info', text: 'café 😀', ...identity })
    expect(first.raw).toBe('[12:34:56] [main/IN')
    expect(Object.isFrozen(snapshot.entries)).toBe(true)
    expect(Object.isFrozen(snapshot.entries[0])).toBe(true)
  })
  it('keeps stdout and stderr partials separate and orders rows by their first fragment', () => {
    const buffer = new GameLogBuffer()
    output(buffer, 1, 'out-'); output(buffer, 2, 'err-', 'stderr')
    output(buffer, 3, 'done\n'); output(buffer, 4, 'done\n', 'stderr')
    expect(raw(buffer)).toEqual(['out-done', 'err-done'])
    expect(buffer.snapshot().entries.map(entry => entry.channel)).toEqual(['stdout', 'stderr'])
    expect(buffer.snapshot().entries[1].level).toBe('error')
  })
  it('isolates reused PIDs, directories and sides and refuses late or conflicting identity', () => {
    const buffer = new GameLogBuffer(), second = { ...identity, launchId: 'two', gameDirectory: '/qa/two', side: 'server' } as const
    buffer.start(identity); output(buffer, 1, 'old')
    buffer.start(second); output(buffer, 1, 'new', 'stdout', second)
    expect(output(buffer, 2, 'wrong', 'stdout', { ...identity, gameDirectory: '/qa/two' })).toBe(false)
    expect(output(buffer, 2, 'wrong', 'stdout', { ...identity, side: 'server' })).toBe(false)
    buffer.exit(identity, { signal: 'SIGTERM' })
    expect(output(buffer, 2, 'late')).toBe(false)
    expect(buffer.exit(identity, { code: 0 })).toBe(false)
    output(buffer, 2, '-tail', 'stdout', second)
    expect(raw(buffer)).toEqual(['old', 'new-tail'])
    expect(buffer.snapshot().entries.find(entry => entry.system?.kind === 'exit')?.system).toMatchObject({ signal: 'SIGTERM', code: undefined })
  })
  it('accepts a mid-process first sequence, rejects duplicates and marks gaps without joining unrelated fragments', () => {
    const buffer = new GameLogBuffer()
    output(buffer, 8, 'first\r')
    expect(buffer.snapshot().limited).toBe(false)
    expect(output(buffer, 8, 'duplicate')).toBe(false)
    expect(output(buffer, 7, 'old')).toBe(false)
    output(buffer, 10, '\nnext')
    expect(raw(buffer)).toEqual(['first', '', 'next'])
    expect(buffer.snapshot().limited).toBe(true)
    expect(output(buffer, 12, '')).toBe(true)
  })
  it('limits a giant partial line without reintroducing the dropped remainder and never cuts a surrogate pair', () => {
    const buffer = new GameLogBuffer()
    output(buffer, 1, 'x'.repeat(MAX_CONSOLE_LINE - 1) + '😀' + 'y'.repeat(100000))
    output(buffer, 2, 'ignored'); output(buffer, 3, '\nnext\n')
    expect(raw(buffer)).toEqual(['x'.repeat(MAX_CONSOLE_LINE - 1), 'next'])
    expect(buffer.snapshot().limited).toBe(true)
    const split = new GameLogBuffer()
    output(split, 1, '\ud83d'); expect(raw(split)).toEqual([''])
    output(split, 2, '\ude00\n'); expect(raw(split)).toEqual(['😀'])
  })
  it('bounds both empty-line count and retained text across instances, keeping the newest complete lines', () => {
    const buffer = new GameLogBuffer()
    output(buffer, 1, '\n'.repeat(MAX_CONSOLE_LINES + 50))
    expect(buffer.snapshot().entries).toHaveLength(MAX_CONSOLE_LINES)
    output(buffer, 2, ('x'.repeat(1000) + '\n').repeat(2000))
    output(buffer, 3, 'LATEST\n', 'stdout', { ...identity, launchId: 'two', gameDirectory: '/qa/two' })
    const snapshot = buffer.snapshot()
    expect(snapshot.entries.reduce((sum, row) => sum + row.raw.length + 1, 0)).toBeLessThanOrEqual(MAX_CONSOLE_TEXT)
    expect(snapshot.entries.length).toBeLessThanOrEqual(MAX_CONSOLE_LINES)
    expect(snapshot.entries.at(-1)?.raw).toBe('LATEST')
    expect(snapshot.limited).toBe(true)
  })
  it('clears only the requested view and captures identity by value without retaining event payloads', () => {
    const buffer = new GameLogBuffer(), event = { ...identity, secret: 'not-an-identity-field' }
    buffer.start(event); output(buffer, 1, 'first', 'stdout', event)
    event.gameDirectory = '/changed'
    output(buffer, 1, 'other', 'stdout', { ...identity, launchId: 'two', gameDirectory: '/qa/two' })
    expect(buffer.snapshot().entries.some(entry => 'secret' in entry)).toBe(false)
    buffer.clear(identity.gameDirectory)
    expect(raw(buffer)).toEqual(['other'])
    output(buffer, 2, 'after-clear')
    expect(raw(buffer)).toEqual(['other', 'after-clear'])
  })
  it('does not allocate entries for invalid identities and caps session bookkeeping for silent processes', () => {
    const buffer = new GameLogBuffer()
    for (const invalid of [{ ...identity, launchId: '' }, { ...identity, pid: NaN }, { ...identity, gameDirectory: '' }]) expect(buffer.start(invalid)).toBe(false)
    expect(buffer.snapshot().entries).toHaveLength(0)
    for (let index = 0; index < 300; index++) buffer.start({ ...identity, launchId: `silent-${index}` })
    expect(buffer.snapshot().limited).toBe(true)
    expect(buffer.snapshot().entries).toHaveLength(300)
    buffer.clear(identity.gameDirectory)
    expect(buffer.snapshot()).toEqual({ entries: [], limited: false })
  })
})
