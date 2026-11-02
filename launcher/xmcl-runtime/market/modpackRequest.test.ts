import { describe, expect, it } from 'vitest'
import type { InstallMarketOptions } from '@xmcl/runtime-api'
import { modpackRequest } from './modpackRequest'

describe('modpack download selectors', () => {
  it('copies selectors without renderer-controlled paths, domains or unknown fields', () => {
    const value = { market: 0 as const, directory: 'outside', domain: '../', version: { versionId: 'Abcd1234', filename: 'pack.mrpack', icon: 'https://example.test/icon.png', path: '../outside' } }
    expect(modpackRequest(value)).toEqual({ market: 0, version: { versionId: 'Abcd1234', filename: 'pack.mrpack', icon: 'https://example.test/icon.png' } })
    expect(modpackRequest({ market: 1, file: [{ fileId: 42 }, { fileId: 43 }] })).toEqual({ market: 1, file: [{ fileId: 42 }, { fileId: 43 }] })
  })

  it.each([
    undefined, { market: 2 }, { market: 0, version: [] }, { market: 0, version: Array(129).fill({ versionId: 'Abcd1234' }) },
    { market: 0, version: { versionId: 12345678 } }, { market: 0, version: { versionId: '../a.zip' } },
    { market: 0, version: { versionId: 'Abcd1234', filename: '../pack.mrpack' } },
    { market: 0, version: { versionId: 'Abcd1234', filename: 'a\\pack.mrpack' } },
    { market: 0, version: { versionId: 'Abcd1234', filename: '' } },
    { market: 0, version: { versionId: 'Abcd1234', icon: {} } },
    { market: 1, file: { fileId: '42' } }, { market: 1, file: { fileId: 0 } }, { market: 1, file: { fileId: 1.5 } },
  ])('rejects invalid selectors before allocating a download directory: %j', value => {
    expect(() => modpackRequest(value as InstallMarketOptions)).toThrow()
  })
})
