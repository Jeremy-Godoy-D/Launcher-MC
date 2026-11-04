import { expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { createMinecraftProcessWatcher } from './launch'

function fixture(stdout: PassThrough | null = new PassThrough()) {
  return Object.assign(new EventEmitter(), { pid: 42, stdout }) as unknown as ChildProcess
}
it('waits for final stdout before publishing exit, including output after the process exit event', async () => {
  const child = fixture(), watcher = createMinecraftProcessWatcher(child), listener = vi.fn()
  watcher.on('minecraft-exit', listener)
  const ended = once(watcher, 'minecraft-exit')
  child.emit('exit', 1, null); expect(listener).not.toHaveBeenCalled()
  ;(child.stdout as PassThrough).end('Crash report saved to: #@!@# C:/Mundos/café-😀.txt\n')
  const [result] = await ended
  expect(result).toMatchObject({ code: 1, signal: null, crashReportLocation: 'C:/Mundos/café-😀.txt' })
  expect(listener).toHaveBeenCalledOnce()
})
it('recognizes a readiness marker split across chunks before a newline and emits once', () => {
  const child = fixture(), source = new EventEmitter(), watcher = createMinecraftProcessWatcher(child, undefined, source), ready = vi.fn()
  watcher.on('minecraft-window-ready', ready)
  source.emit('data', 'LWJGL Ver'); source.emit('data', 'sion: 3.3'); source.emit('data', '.3\nOpenAL initialized.\n')
  expect(ready).toHaveBeenCalledOnce(); child.emit('exit', 0, null); source.emit('end')
})
it('decodes split UTF8 paths and collects a multi-line crash fallback with a finite budget', async () => {
  const child = fixture(), watcher = createMinecraftProcessWatcher(child), ended = once(watcher, 'minecraft-exit')
  const bytes = Buffer.from('---- Minecraft Crash Report ----\ncrash café 😀\nCrash report saved to C:/Mundos/漢字.txt\n')
  for (const byte of bytes) (child.stdout as PassThrough).write(Buffer.from([byte]))
  ;(child.stdout as PassThrough).write('body '.repeat(30000) + '\n'); (child.stdout as PassThrough).end(); child.emit('exit', 1, null)
  const [result] = await ended
  expect(result.crashReportLocation).toBe('C:/Mundos/漢字.txt')
  expect(result.crashReport).toContain('crash café 😀'); expect(result.crashReport).toContain('[crash output truncated]'); expect(result.crashReport.length).toBeLessThanOrEqual(65536)
})
it('uses the supplied decoded stream and does not inspect raw stdout a second time', () => {
  const child = fixture(), source = new EventEmitter(), watcher = createMinecraftProcessWatcher(child, undefined, source), ready = vi.fn(), exit = vi.fn()
  watcher.on('minecraft-window-ready', ready); watcher.on('minecraft-exit', exit)
  ;(child.stdout as PassThrough).write('OpenAL initialized.\n'); expect(ready).not.toHaveBeenCalled()
  source.emit('data', ' Preparing level world\n'); expect(ready).toHaveBeenCalledOnce()
  child.emit('exit', 0, null); expect(exit).not.toHaveBeenCalled(); source.emit('end'); source.emit('end'); expect(exit).toHaveBeenCalledOnce()
  ;(child.stdout as PassThrough).destroy()
})
it('does not announce readiness from trailing output after exit', () => {
  const child = fixture(), source = new EventEmitter(), watcher = createMinecraftProcessWatcher(child, undefined, source), ready = vi.fn()
  watcher.on('minecraft-window-ready', ready); child.emit('exit', 0, null); source.emit('data', 'OpenAL initialized.\n'); source.emit('end')
  expect(ready).not.toHaveBeenCalled()
})
it('finishes immediately when no stdout pipe exists', () => {
  const child = fixture(null), watcher = createMinecraftProcessWatcher(child), listener = vi.fn()
  watcher.on('minecraft-exit', listener); child.emit('exit', null, 'SIGTERM')
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ code: null, signal: 'SIGTERM' }))
})
it('keeps the no-exit contract for an error before the process spawned', () => {
  const child = fixture(null); delete (child as any).pid
  const watcher = createMinecraftProcessWatcher(child), error = vi.fn(), exit = vi.fn()
  watcher.on('error', error); watcher.on('minecraft-exit', exit)
  child.emit('error', new Error('spawn failed')); child.emit('exit', -1, null)
  expect(error).toHaveBeenCalledOnce(); expect(exit).not.toHaveBeenCalled()
})
it('still finishes after an error from a process that had already spawned', () => {
  const child = fixture(null), watcher = createMinecraftProcessWatcher(child), error = vi.fn(), exit = vi.fn()
  watcher.on('error', error); watcher.on('minecraft-exit', exit)
  child.emit('error', new Error('signal failed')); child.emit('exit', null, 'SIGTERM')
  expect(error).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce()
})
