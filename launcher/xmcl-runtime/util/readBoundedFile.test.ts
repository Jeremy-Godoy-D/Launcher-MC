import { beforeEach, expect, it, vi } from 'vitest'
import { readBoundedFile } from './readBoundedFile'

const mocks = vi.hoisted(() => ({ lstat: vi.fn(), open: vi.fn() }))
vi.mock('node:fs/promises', () => mocks)
const info = () => ({ ino: 9007199254740992n, dev: 3n, size: 4n, mtimeNs: 1000001n, ctimeNs: 2000001n, isFile: () => true, isSymbolicLink: () => false })
let before: ReturnType<typeof info>, opened: ReturnType<typeof info>, after: ReturnType<typeof info>, handle: any
beforeEach(() => {
  vi.resetAllMocks(); before = info(); opened = info(); after = info()
  mocks.lstat.mockImplementation(async () => mocks.lstat.mock.calls.length === 1 ? before : after)
  handle = { stat: vi.fn(async () => opened), close: vi.fn(async () => {}), read: vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    const data = Buffer.from('test').subarray(position, position + length)
    data.copy(buffer, offset); return { bytesRead: data.length }
  }) }
  mocks.open.mockResolvedValue(handle)
})
it('reads only the budgeted bytes while comparing exact handle and path identities', async () => {
  expect(await readBoundedFile('owned-file', 4)).toEqual(Buffer.from('test'))
  expect(mocks.lstat.mock.calls).toEqual([['owned-file', { bigint: true }], ['owned-file', { bigint: true }]])
  expect(handle.stat).toHaveBeenCalledWith({ bigint: true }); expect(handle.close).toHaveBeenCalledOnce()
})
it.each(['handle', 'path'] as const)('rejects an inode replacement that Number would round away at the %s boundary', async boundary => {
  const replaced = boundary === 'handle' ? opened : after
  replaced.ino += 1n
  expect(Number(before.ino)).toBe(Number(replaced.ino))
  await expect(readBoundedFile('owned-file', 4)).rejects.toMatchObject({ name: 'WorldChangedError' })
  expect(handle.close).toHaveBeenCalledOnce()
  if (boundary === 'handle') expect(handle.read).not.toHaveBeenCalled()
})
it.each(['mtimeNs', 'ctimeNs'] as const)('detects changes inside the same millisecond through %s', async field => {
  after[field] += 1n
  await expect(readBoundedFile('owned-file', 4)).rejects.toMatchObject({ name: 'WorldChangedError' })
})
it('rejects oversized files and invalid budgets before allocating or opening', async () => {
  before.size = 5n
  await expect(readBoundedFile('owned-file', 4)).rejects.toThrow('Unsafe')
  for (const limit of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) await expect(readBoundedFile('owned-file', limit)).rejects.toThrow('Invalid')
  expect(mocks.open).not.toHaveBeenCalled()
})
