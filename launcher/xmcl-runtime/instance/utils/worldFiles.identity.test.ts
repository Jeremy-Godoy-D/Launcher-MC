import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { worldLocation } from './worldFiles'

const inode = vi.hoisted(() => ({ path: '', value: 9007199254740992n }))
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, lstat: async (path: any, options: any) => {
    const result = await actual.lstat(path, options)
    if (path === inode.path) Object.assign(result, { ino: options?.bigint ? inode.value : Number(inode.value) })
    return result
  } }
})
let root: string
afterEach(async () => {
  if (root) {
    expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-identity-test-')
    await rm(root, { recursive: true, force: true })
  }
  inode.path = ''
})
it('changes the world authority fingerprint for adjacent large file IDs without serializing raw BigInt', async () => {
  root = await mkdtemp(join(process.cwd(), '.world-identity-test-'))
  const instance = join(root, 'instance'); inode.path = join(instance, 'saves/Alpha')
  await mkdir(inode.path, { recursive: true })
  const first = await worldLocation(instance, 'Alpha', root)
  inode.value += 1n
  expect(Number(inode.value)).toBe(Number(inode.value - 1n))
  const replaced = await worldLocation(instance, 'Alpha', root)
  expect(first.identity).not.toBe(replaced.identity)
  expect(() => JSON.stringify(replaced)).not.toThrow()
})
