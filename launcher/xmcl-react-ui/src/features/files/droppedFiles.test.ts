import { expect, it, vi } from 'vitest'
import { acceptsDrop, droppedFiles } from './droppedFiles'

const file = { name: 'mod.jar', size: 10, type: 'application/java-archive' } as File
it('uses only native absolute paths and bounds the drop before resolving files', () => {
  expect(droppedFiles([file], () => 'C:\\owned\\mod.jar')).toEqual([{ path: 'C:\\owned\\mod.jar', name: 'mod.jar', folder: false }])
  for (const path of ['', 'relative.jar', 'https://example.org/mod.jar', '/bad\npath']) expect(() => droppedFiles([file], () => path)).toThrow()
  expect(() => droppedFiles([file, file], () => '/same.jar')).toThrow()
  const get = vi.fn(); expect(() => droppedFiles(Array(257).fill(file), get)).toThrow(); expect(get).not.toHaveBeenCalled()
})
it('routes supported formats by the active area and never mixes world imports or archives', () => {
  const mod = droppedFiles([file], () => '/mod.jar'), archive = [{ path: '/pack.mrpack', name: 'pack.mrpack', folder: false }]
  expect(acceptsDrop('mods', mod)).toBe(true); expect(acceptsDrop('shaderpacks', mod)).toBe(false)
  expect(acceptsDrop('archive', archive)).toBe(true); expect(acceptsDrop('archive', [...archive, ...archive])).toBe(false)
  expect(acceptsDrop('worlds', [{ path: '/world', name: 'world', folder: true }])).toBe(true)
  expect(acceptsDrop('mods', [{ path: '/run.exe', name: 'run.exe', folder: false }])).toBe(false)
})
