import { expect, test } from 'vitest'
import { isolateImportedClient } from './importedClient'

test('isolates local bytes with a stable hash and permits no remote fallback for a local-only client', () => {
  const data = Buffer.from('local client')
  const first = isolateImportedClient(undefined, data)
  expect(first.id).toMatch(/^\.client-[a-f0-9]{24}$/)
  expect(first.download).toMatchObject({ url: '', size: data.length })
  expect(isolateImportedClient(undefined, data).id).toBe(first.id)
  expect(isolateImportedClient(undefined, Buffer.from('other client')).id).not.toBe(first.id)
})
test('pins a remote client by declared SHA-1 without including the URL in its identity', () => {
  const first = isolateImportedClient({ sha1: 'a'.repeat(40), url: 'https://example.com/client.jar', size: 1 })
  expect(first.id).toBe(`.client-${'a'.repeat(40)}`)
  expect(isolateImportedClient({ ...first.download, url: 'https://mirror.example.com/client.jar' }).id).toBe(first.id)
})
test.each([
  {}, { sha1: 'bad', url: 'https://example.com/a' }, { sha1: 'a'.repeat(40), url: 'file:///private' },
  { sha1: 'a'.repeat(40), url: 'https://user:pass@example.com/a' }, { sha1: 'a'.repeat(40), url: '' },
])('rejects an unavailable or unsafe client descriptor %j', value => {
  expect(() => isolateImportedClient(value)).toThrow()
})
test('does not ignore declared hashes or sizes when copying cached clients', () => {
  expect(() => isolateImportedClient({ sha1: '0'.repeat(40) }, Buffer.from('different'))).toThrow('checksum')
  expect(() => isolateImportedClient({ size: 999 }, Buffer.from('different'))).toThrow('size')
})
