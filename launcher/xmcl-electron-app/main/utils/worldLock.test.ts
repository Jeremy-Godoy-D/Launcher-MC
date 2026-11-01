import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorldLock } from '@xmcl/runtime/app/LauncherApp'

vi.mock('./gameWindow/koffi', async () => ({ getKoffi: () => koffi }))
const koffi = (await import('koffi')).default
const { acquireWindowsWorldLock } = await import('./worldLock')

describe.runIf(process.platform === 'win32')('Windows world session byte-range locks', () => {
  let root: string, world: string, locks: WorldLock[]
  async function acquire(create = true) {
    const lock = await acquireWindowsWorldLock(world, create)
    if (lock) locks.push(lock)
    return lock
  }
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-session-lock-')))
    world = join(root, 'world'); await mkdir(world); locks = []
  })
  afterEach(async () => {
    for (const lock of locks.reverse()) lock.release()
    expect(dirname(root)).toBe(await realpath(tmpdir())); expect(root).toContain('grimo-session-lock-')
    await rm(root, { recursive: true, force: true })
  })
  it('does not create a file on preview, and keeps an exclusive lock until release', async () => {
    expect(await acquire(false)).toBeUndefined()
    await expect(lstat(join(world, 'session.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
    const first = await acquire(); await first!.verify()
    await expect(acquire()).rejects.toHaveProperty('name', 'InstanceRunningError')
    first!.release(); const next = await acquire(); await next!.verify()
  })
  it('preserves stale lock bytes and detects a replaced lock without leaking handles', async () => {
    const path = join(world, 'session.lock'), bytes = Buffer.from('☃')
    await writeFile(path, bytes); const lock = await acquire(false)
    await rename(path, join(world, 'old.lock')); await writeFile(path, 'replacement')
    await expect(lock!.verify()).rejects.toHaveProperty('name', 'WorldLockUnavailableError')
    lock!.release(); expect(await readFile(join(world, 'old.lock'))).toEqual(bytes)
    const next = await acquire(); next!.release(); expect(await readFile(path, 'utf8')).toBe('replacement')
  })
  it('refuses linked, hard-linked and non-file session controls', async () => {
    const path = join(world, 'session.lock'), outside = join(root, 'outside.lock')
    await writeFile(outside, 'sentinel')
    const outsideDir = join(root, 'outside'); await mkdir(outsideDir)
    await symlink(outsideDir, path, 'junction'); await expect(acquire()).rejects.toHaveProperty('name', 'WorldLockUnavailableError'); await rm(path)
    await link(outside, path); await expect(acquire()).rejects.toHaveProperty('name', 'WorldLockUnavailableError'); await rm(path)
    await mkdir(path); await expect(acquire()).rejects.toHaveProperty('name', 'WorldLockUnavailableError')
    expect(await readFile(outside, 'utf8')).toBe('sentinel')
  })
  it('blocks whole-world rename while a child handle is live and permits it after release', async () => {
    const lock = await acquire()
    await expect(rename(world, join(root, 'backup'))).rejects.toMatchObject({ code: 'EPERM' })
    await lock!.verify(); lock!.release(); await rename(world, join(root, 'backup'))
    world = join(root, 'backup'); await acquire()
  })
})
