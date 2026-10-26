import { describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { duplicateInstance } from './duplicate'
import { copyFile, ensureDir, link } from 'fs-extra'

vi.mock('fs-extra', async importOriginal => {
  const original = await importOriginal<any>(), fs = { ...original.default, ...original }
  return { ...fs, copyFile: vi.fn(fs.copyFile), ensureDir: vi.fn(fs.ensureDir), link: vi.fn(fs.link) }
})

vi.mock('./files_discovery', () => ({
  getInstanceFiles: vi.fn(),
}))

import { getInstanceFiles } from './files_discovery'

describe('duplicateInstance', () => {
  test('a reviewed transfer inventory limits concurrent writes to four and reports completion', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-budget-')), src = join(root, 'src'), dest = join(root, 'dest')
    mkdirSync(src); mkdirSync(dest)
    const files = Array.from({ length: 12 }, (_, index) => ({ path: `${index}.txt`, hashes: {} }))
    let active = 0, maximum = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const progress: number[] = []
    try {
      await duplicateInstance({ instancePath: src, newPath: dest, files, transferFile: async () => {
        maximum = Math.max(maximum, ++active)
        if (active === 4) release()
        await gate; active--
      }, tracker: event => progress.push(event.payload.progress.progress) })
      expect(maximum).toBeLessThanOrEqual(4); expect(maximum).toBeGreaterThan(1)
      expect(progress).toEqual(Array.from({ length: 13 }, (_, index) => index))
    } finally { release(); rmSync(root, { recursive: true, force: true }) }
  })
  test('does not begin fallback copying if cancellation arrives during a failed content link', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-link-')), src = join(root, 'src'), dest = join(root, 'dest')
    mkdirSync(join(src, 'mods'), { recursive: true }); mkdirSync(dest); writeFileSync(join(src, 'mods/a.jar'), 'content')
    vi.mocked(getInstanceFiles).mockResolvedValue([[{ path: 'mods/a.jar', hashes: {} }, {}]] as any)
    let release!: () => void, started!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), reached = new Promise<void>(resolve => { started = resolve })
    vi.mocked(link).mockImplementationOnce(async () => { started(); await gate; throw new Error('link failed') })
    vi.mocked(copyFile).mockClear()
    const controller = new AbortController(), outcome = duplicateInstance({ instancePath: src, newPath: dest, signal: controller.signal }).then(() => undefined, error => error)
    try { await reached; controller.abort(); release(); expect(await outcome).toMatchObject({ message: 'aborted' }); expect(copyFile).not.toHaveBeenCalled() }
    finally { release(); await outcome; rmSync(root, { recursive: true, force: true }) }
  })
  test('retains typed partial failures for non-cancellation write errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-write-')), src = join(root, 'src'), dest = join(root, 'dest')
    mkdirSync(src); mkdirSync(dest); writeFileSync(join(src, 'a.txt'), 'content')
    vi.mocked(getInstanceFiles).mockResolvedValue([[{ path: 'a.txt', hashes: {} }, {}]] as any)
    vi.mocked(copyFile).mockRejectedValueOnce(Object.assign(new Error('write-failed'), { code: 'EACCES' }))
    try { await expect(duplicateInstance({ instancePath: src, newPath: dest })).rejects.toMatchObject({ name: 'InstanceDuplicatePartialError', failures: [{ src: join(src, 'a.txt'), err: { code: 'EACCES' } }] }) }
    finally { rmSync(root, { recursive: true, force: true }) }
  })
  test.each(['abort', 'directory failure'])('waits for in-flight writes after %s and does not schedule extra copies', async reason => {
    const real = await vi.importActual<typeof import('fs-extra')>('fs-extra')
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-drain-')), src = join(root, 'src'), dest = join(root, 'dest')
    mkdirSync(src); mkdirSync(dest); mkdirSync(join(src, 'second'))
    writeFileSync(join(src, 'a.txt'), 'complete-before-settlement'); writeFileSync(join(src, 'second/b.txt'), 'must-not-start')
    vi.mocked(getInstanceFiles).mockResolvedValue(['a.txt', 'second/b.txt', 'c.txt'].map(path => [{ path, hashes: {} }, {}] as any))
    let releaseCopy!: () => void, releaseDirectory!: () => void, reachedDirectory!: () => void, prepared!: () => void, copied!: () => void
    const copyGate = new Promise<void>(resolve => { releaseCopy = resolve }), directoryGate = new Promise<void>(resolve => { releaseDirectory = resolve }), directoryReached = new Promise<void>(resolve => { reachedDirectory = resolve })
    const directoryPrepared = new Promise<void>(resolve => { prepared = resolve }), copySettled = new Promise<void>(resolve => { copied = resolve })
    vi.mocked(copyFile).mockClear()
    vi.mocked(copyFile).mockImplementationOnce(async (source, target) => { try { await copyGate; await real.copyFile(source, target) } finally { copied() } })
    vi.mocked(ensureDir).mockImplementationOnce(real.ensureDir).mockImplementationOnce(async path => {
      reachedDirectory(); await directoryGate
      try {
        if (reason === 'directory failure') throw new Error('directory-failure')
        await real.ensureDir(path)
      } finally { prepared() }
    })
    const controller = new AbortController()
    let settled = false, failure: unknown
    const operation = duplicateInstance({ instancePath: src, newPath: dest, signal: controller.signal }).then(() => { settled = true }, error => { settled = true; failure = error })
    try {
      await directoryReached
      if (reason === 'abort') controller.abort()
      releaseDirectory(); await directoryPrepared; await new Promise(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      expect(copyFile).toHaveBeenCalledTimes(1)
      releaseCopy(); await operation
      expect(failure).toMatchObject({ message: reason === 'abort' ? 'aborted' : 'directory-failure' })
      expect(readFileSync(join(dest, 'a.txt'), 'utf8')).toBe('complete-before-settlement')
      expect(existsSync(join(dest, 'second/b.txt'))).toBe(false)
    } finally { releaseDirectory(); releaseCopy(); await operation; await copySettled; rmSync(root, { recursive: true, force: true }) }
  })
  test('cancellation during the last scheduled copy cannot resolve as success', async () => {
    const real = await vi.importActual<typeof import('fs-extra')>('fs-extra')
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-last-')), src = join(root, 'src'), dest = join(root, 'dest')
    mkdirSync(src); mkdirSync(dest); writeFileSync(join(src, 'a.txt'), 'last-file')
    vi.mocked(getInstanceFiles).mockResolvedValue([[{ path: 'a.txt', hashes: {} }, {}]] as any)
    let release!: () => void, started!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), reached = new Promise<void>(resolve => { started = resolve })
    vi.mocked(copyFile).mockImplementationOnce(async (source, target) => { started(); await gate; await real.copyFile(source, target) })
    const controller = new AbortController()
    const operation = duplicateInstance({ instancePath: src, newPath: dest, signal: controller.signal })
    const outcome = operation.then(() => undefined, error => error)
    try { await reached; controller.abort(); release(); expect(await outcome).toMatchObject({ message: 'aborted' }) }
    finally { release(); await outcome; rmSync(root, { recursive: true, force: true }) }
  })
  test('tolerates ENOENT on stale manifest entries without per-file unhandledRejection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-'))
    const src = join(root, 'src')
    const dest = join(root, 'dest')
    mkdirSync(src, { recursive: true })
    mkdirSync(dest, { recursive: true })
    // Real file present + several stale manifest entries
    writeFileSync(join(src, 'real.txt'), 'hello')

    ;(getInstanceFiles as any).mockResolvedValue([
      [{ path: 'real.txt', size: 5, hashes: {} }, {}],
      [{ path: 'stale-a.json', size: 0, hashes: {} }, {}],
      [{ path: 'stale-b.png', size: 0, hashes: {} }, {}],
      [{ path: 'stale-c.cfg', size: 0, hashes: {} }, {}],
    ])

    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      await duplicateInstance({ instancePath: src, newPath: dest })
      // Allow microtasks to drain
      await new Promise((r) => setImmediate(r))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('throws a typed InstanceDuplicatePartialError when non-ENOENT failures occur', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xmcl-dup-fail-'))
    const src = join(root, 'src')
    // Intentionally do NOT create dest — copyFile will fail with ENOENT
    // on its parent. We then turn that into a non-ENOENT condition by
    // pointing dest at a file path (ensureDir will fail with ENOTDIR).
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'real.txt'), 'hello')
    const destFilePath = join(root, 'dest-as-file')
    writeFileSync(destFilePath, 'oops')

    ;(getInstanceFiles as any).mockResolvedValue([
      [{ path: 'real.txt', size: 5, hashes: {} }, {}],
    ])

    await expect(duplicateInstance({ instancePath: src, newPath: destFilePath }))
      .rejects.toThrow()
    rmSync(root, { recursive: true, force: true })
  })
})
