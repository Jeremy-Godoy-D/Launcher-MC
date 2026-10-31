import { expect, it, vi } from 'vitest'
import { migrateLegacyModGroups } from './migrateLegacyModGroups'

function storage(value: unknown) {
  let raw: string | null = JSON.stringify(value)
  return { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value }, removeItem: () => { raw = null } }
}
it('removes only the imported path after a persistence acknowledgment', async () => {
  const cache = storage({ a: { 'x.jar': 'A' }, b: { 'b.jar': 'B' } }), save = vi.fn(async () => 'imported' as const)
  await migrateLegacyModGroups(cache, 'a', save)
  expect(save).toHaveBeenCalledWith('a', { 'x.jar': 'A' })
  expect(JSON.parse(cache.getItem()!)).toEqual({ b: { 'b.jar': 'B' } })
})
it('preserves legacy data on disk failure, native precedence and concurrent local changes', async () => {
  const original = { a: { 'x.jar': 'A' } }, cache = storage(original)
  await expect(migrateLegacyModGroups(cache, 'a', async () => { throw new Error('disk') })).rejects.toThrow('disk')
  expect(JSON.parse(cache.getItem()!)).toEqual(original)
  await migrateLegacyModGroups(cache, 'a', async () => 'existing')
  expect(JSON.parse(cache.getItem()!)).toEqual(original)
  await migrateLegacyModGroups(cache, 'a', async () => { cache.setItem('modsGrouping', JSON.stringify({ a: { 'x.jar': 'newer' } })); return 'imported' })
  expect(JSON.parse(cache.getItem()!)).toEqual({ a: { 'x.jar': 'newer' } })
})
it('does not migrate inherited keys or malformed mappings', async () => {
  const save = vi.fn(async () => 'imported' as const)
  expect(await migrateLegacyModGroups(storage({ a: {} }), 'constructor', save)).toBe('none')
  await expect(migrateLegacyModGroups(storage({ a: [] }), 'a', save)).rejects.toThrow('InvalidLegacy')
  expect(save).not.toHaveBeenCalled()
})
