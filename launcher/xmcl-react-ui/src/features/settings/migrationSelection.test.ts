import { expect, it, vi } from 'vitest'
import { migrateSelectedInstance } from './migrationSelection'

it('remaps only managed instances using committed native context, idempotently', () => {
  let value = 'C:\\old\\instances\\Mi mundo'
  const storage = { getItem: () => value, setItem: vi.fn((_key: string, next: string) => { value = next }) }
  const context = { from: 'c:\\old', to: 'D:\\Grimo datos' }
  migrateSelectedInstance(storage, context); migrateSelectedInstance(storage, context)
  expect(value).toBe('D:\\Grimo datos\\instances\\Mi mundo'); expect(storage.setItem).toHaveBeenCalledTimes(1)
})
it('preserves external, similar-prefix and invalid paths, and does nothing without context', () => {
  for (const selected of ['C:\\external\\world', 'C:\\old\\instances-other\\world', 'C:\\old\\instances\\..\\world']) {
    const storage = { getItem: () => selected, setItem: vi.fn() }
    migrateSelectedInstance(storage, { from: 'C:\\old', to: 'D:\\new' }); migrateSelectedInstance(storage, undefined)
    expect(storage.setItem).not.toHaveBeenCalled()
  }
})
