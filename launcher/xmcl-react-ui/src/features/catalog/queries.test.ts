import { afterEach, expect, it, vi } from 'vitest'
import { catalogError, catalogQueries, publicMetadataFetch } from './queries'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('honors Retry-After per origin without issuing another request or blocking a healthy source', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  const fetch = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } })); vi.stubGlobal('fetch', fetch)
  await expect(publicMetadataFetch('https://limited.example.test/api')).rejects.toMatchObject({ status: 429, retryAt: Date.now() + 120000 })
  await expect(publicMetadataFetch('https://limited.example.test/other')).rejects.toMatchObject({ status: 429 })
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockImplementation(async () => Response.json({ ok: true }))
  expect((await publicMetadataFetch('https://healthy.example.test/api')).ok).toBe(true)
  vi.advanceTimersByTime(120001)
  expect((await publicMetadataFetch('https://limited.example.test/api')).ok).toBe(true)
})
it('bounds retries to two transient failures and never retries authentication, quota or invalid metadata', () => {
  const retry = catalogQueries.getDefaultOptions().queries!.retry as (count: number, error: Error) => boolean
  expect(retry(0, new TypeError('Network'))).toBe(true); expect(retry(1, Object.assign(new Error(), { status: 503 }))).toBe(true); expect(retry(2, new TypeError('Network'))).toBe(false)
  for (const status of [400, 401, 403, 404, 429]) expect(retry(0, Object.assign(new Error(), { status }))).toBe(false)
  expect(retry(0, new Error('Invalid catalog response'))).toBe(false)
})
it('passes cancellation to fetch and exposes only fixed error categories', async () => {
  const signal = new AbortController().signal, fetch = vi.fn(async () => Response.json({})); vi.stubGlobal('fetch', fetch)
  await publicMetadataFetch('https://signal.example.test/x', { signal }); expect(fetch).toHaveBeenCalledWith('https://signal.example.test/x', { signal })
  expect(catalogError({ status: 403, body: 'private details' })).toBe('unauthorized'); expect(catalogError({ status: 429 })).toBe('limited'); expect(catalogError(new Error('secret'))).toBe('failed')
})
