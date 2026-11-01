import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, link } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { exportLogView } from './exportLogView'

const base = resolve(process.cwd())
let root: string
beforeEach(async () => { root = await mkdtemp(join(base, '.console-export-test-')) })
afterEach(async () => {
  if (dirname(root) !== base || !basename(root).startsWith('.console-export-test-')) throw new Error('Unowned test directory')
  await rm(root, { recursive: true, force: true })
})
it('saves Unicode, blank lines and spaces to the selected native destination and replaces a chosen file completely', async () => {
  const path = join(root, 'chosen.log'), select = vi.fn(async () => ({ canceled: false, filePath: path }))
  await writeFile(path, 'ORIGINAL LONGER CONTENT')
  const text = 'café 😀\n\n  \nlast'
  expect(await exportLogView(text, 'view.log', select)).toBe(true)
  expect(select).toHaveBeenCalledWith('view.log')
  expect(await readFile(path, 'utf8')).toBe(text)
  expect(await readdir(root)).toEqual(['chosen.log'])
})
it('cancels without creating or modifying a destination', async () => {
  const path = join(root, 'preserved.log'); await writeFile(path, 'ORIGINAL')
  expect(await exportLogView('replacement', 'view.log', async () => ({ canceled: true, filePath: path }))).toBe(false)
  expect(await readFile(path, 'utf8')).toBe('ORIGINAL')
  expect(await readdir(root)).toEqual(['preserved.log'])
})
it.each([
  [undefined, 'view.log'], ['x'.repeat(1024 * 1024 + 1), 'view.log'], ['text', '../view.log'],
  ['text', 'folder/view.log'], ['text', 'con.log'], ['text', 'view.exe'], ['text', 'x'.repeat(180) + '.log'],
])('rejects invalid view input before opening a picker (%#)', async (text, name) => {
  const select = vi.fn()
  await expect(exportLogView(text, name, select)).rejects.toThrow('Could not export log view')
  expect(select).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([])
})
it.each([undefined, 'relative.log', 'view.exe'])('refuses an invalid native destination (%s)', async path => {
  await expect(exportLogView('text', 'view.log', async () => ({ canceled: false, filePath: path }))).rejects.toThrow('Could not export log view')
  expect(await readdir(root)).toEqual([])
})
it('reports write failure without replacing an existing directory or exposing the payload', async () => {
  const path = join(root, 'directory.log'); await mkdir(path); await writeFile(join(path, 'preserved'), 'ORIGINAL')
  await expect(exportLogView('PRIVATE CONTENT', 'view.log', async () => ({ canceled: false, filePath: path }))).rejects.toThrow(/^Could not export log view$/)
  expect(await readFile(join(path, 'preserved'), 'utf8')).toBe('ORIGINAL')
})
it('refuses a linked destination and preserves both aliases', async () => {
  const source = join(root, 'original.log'), alias = join(root, 'alias.log')
  await writeFile(source, 'ORIGINAL'); await link(source, alias)
  await expect(exportLogView('replacement', 'view.log', async () => ({ canceled: false, filePath: alias }))).rejects.toThrow('Could not export log view')
  expect(await readFile(source, 'utf8')).toBe('ORIGINAL'); expect(await readFile(alias, 'utf8')).toBe('ORIGINAL')
})
