import { dirname, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createBootstrapSession } from './bootstrapSession'

const root = resolve('bootstrap-fixture')
test('rejects malformed and relative paths before any filesystem operation', async () => {
  const validate = vi.fn()
  const handler = createBootstrapSession(validate, vi.fn(), vi.fn())
  for (const input of [null, {}, '', 'relative/path', `${root}\n`, 'a'.repeat(32768)])
    await expect(handler(input)).rejects.toThrow('Invalid bootstrap path')
  expect(validate).not.toHaveBeenCalled()
})
test.skipIf(process.platform !== 'win32')(
  'rejects Windows/executable directories regardless of letter case',
  async () => {
    const validate = vi.fn()
    const handler = createBootstrapSession(validate, vi.fn(), vi.fn())
    const roots = [process.env.SystemRoot, dirname(process.execPath)].filter(
      (path): path is string => !!path,
    )
    for (const path of roots)
      await expect(handler(resolve(path, 'bootstrap-child').toUpperCase())).rejects.toThrow(
        'Invalid bootstrap path',
      )
    expect(validate).not.toHaveBeenCalled()
  },
)
test('permits retry after failed validation/persistence and deduplicates a concurrent identical request', async () => {
  const validate = vi.fn().mockResolvedValueOnce('noperm').mockResolvedValue(undefined)
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error('Write failed'))
    .mockResolvedValue(undefined)
  const activate = vi.fn().mockResolvedValue(undefined)
  const handler = createBootstrapSession(validate, prepare, activate)
  await expect(handler(root)).rejects.toThrow('rejected')
  await expect(handler(root)).rejects.toThrow('Write failed')
  const first = handler(root)
  expect(handler(root)).toBe(first)
  await expect(handler(resolve('other-bootstrap-fixture'))).rejects.toThrow('already')
  await first
  await handler(root)
  expect(activate).toHaveBeenCalledTimes(1)
  expect(prepare).toHaveBeenCalledTimes(2)
})
test('waits for native activation and remains closed if activation fails after committing a root', async () => {
  let reject!: (error: Error) => void
  const prepare = vi.fn().mockResolvedValue(undefined)
  const handler = createBootstrapSession(
    async () => 'exists',
    prepare,
    () =>
      new Promise((_, fail) => {
        reject = fail
      }),
  )
  let complete = false
  const pending = handler(root).then(() => {
    complete = true
  })
  for (let i = 0; i < 8; i++) await Promise.resolve()
  expect(complete).toBe(false)
  reject(new Error('Activation failed'))
  await expect(pending).rejects.toThrow('Activation failed')
  await expect(handler(resolve('other-bootstrap-fixture'))).rejects.toThrow('already')
  await expect(handler(root)).rejects.toThrow('Activation failed')
  expect(prepare).toHaveBeenCalledTimes(1)
})
