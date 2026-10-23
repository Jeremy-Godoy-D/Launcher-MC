import { afterEach, expect, test, vi } from 'vitest'
import { createCurseforgeProxyClient, getCurseforgeProxyUrl } from './curseforgeProxy'

afterEach(() => vi.unstubAllEnvs())

test('background file resolution uses the proxy and retains POST body and abort signal', async () => {
  vi.stubEnv('CURSEFORGE_PROXY_URL', 'https://catalog.example.test')
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [] }))
  const client = createCurseforgeProxyClient(fetch)
  const signal = new AbortController().signal
  client.headers = { 'X-Api-Key': 'do-not-forward', Authorization: 'private', Cookie: 'private', accept: 'application/json' }
  expect(await client.getFiles([4953893], signal)).toEqual([])
  const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.href).toBe('https://catalog.example.test/v1/mods/files')
  expect(init).toMatchObject({ method: 'POST', body: '{"fileIds":[4953893]}', signal })
  const headers = new Headers(init.headers)
  expect(Array.from(headers.keys())).toEqual(['accept', 'content-type'])
})

test('background searches preserve path and filters without a client API key', async () => {
  vi.stubEnv('CURSEFORGE_PROXY_URL', 'https://catalog.example.test/')
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [], pagination: {} }))
  const client = createCurseforgeProxyClient(fetch)
  await client.searchMods({ searchFilter: 'appleskin', gameVersion: '1.20.4', pageSize: 1 })
  const url = fetch.mock.calls[0][0] as unknown as URL
  expect(url.origin).toBe('https://catalog.example.test')
  expect(url.pathname).toBe('/v1/mods/search')
  expect(url.searchParams.get('searchFilter')).toBe('appleskin')
  expect(client.headers).not.toHaveProperty('x-api-key')
})

test('missing or unsafe proxy configuration fails closed without contacting CurseForge', async () => {
  for (const value of ['', 'http://proxy.test', 'https://user:pass@proxy.test', 'https://api.curseforge.com', 'https://proxy.test/path', 'https://proxy.test/?key=x', 'https://proxy.test/#x']) {
    vi.stubEnv('CURSEFORGE_PROXY_URL', value)
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [] }))
    const client = createCurseforgeProxyClient(fetch)
    await expect(client.getFiles([1])).rejects.toMatchObject({ status: 503 })
    expect(fetch).not.toHaveBeenCalled()
  }
})

test('only CurseForge API requests can be rewritten', () => {
  vi.stubEnv('CURSEFORGE_PROXY_URL', 'https://catalog.example.test')
  expect(() => getCurseforgeProxyUrl(new URL('https://untrusted.test/v1/mods'))).toThrow('invalid_proxy')
})
