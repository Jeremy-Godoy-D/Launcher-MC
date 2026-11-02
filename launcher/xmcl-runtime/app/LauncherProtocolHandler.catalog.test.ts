import { afterEach, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { LauncherProtocolHandler } from './LauncherProtocolHandler'

const id = '8d01ecb7-21e2-4f72-9db3-aacb2e8b40fd'
const request = () => ({ url: 'https://api.modrinth.com/v2/search', headers: { 'X-Grimo-Catalog-Request': id } })
const cancel = (protocol: LauncherProtocolHandler, token = id) => protocol.handle({ url: `http://launcher/catalog-request/${token}`, method: 'POST' })
afterEach(() => vi.useRealTimers())

it('cancels only the identified metadata read and removes its header before any provider or proxy', async () => {
  const protocol = new LauncherProtocolHandler(), sink = vi.fn(({ request, response }) => { expect(request.headers).toEqual({}); response.status = 200; response.body = new Readable({ read() {} }) })
  protocol.registerHandler('https', sink, true)
  const response = await protocol.handle(request()), signal = sink.mock.calls[0][0].request.signal as AbortSignal
  await cancel(protocol, 'deca79db-51d4-4683-9c71-bc2fba91bc4f'); expect(signal.aborted).toBe(false)
  expect((await cancel(protocol)).status).toBe(204); expect(signal.aborted).toBe(true)
  ;(response.body as Readable).destroy()
})
it('handles cancellation arriving before dispatch without starting the network operation', async () => {
  const protocol = new LauncherProtocolHandler(), sink = vi.fn(); protocol.registerHandler('https', sink, true)
  await cancel(protocol)
  await expect(protocol.handle(request())).rejects.toHaveProperty('name', 'AbortError'); expect(sink).not.toHaveBeenCalled()
})
it('bounds a stalled public read to 30 seconds and clears the retained capability', async () => {
  vi.useFakeTimers(); const protocol = new LauncherProtocolHandler(); let signal: AbortSignal | undefined
  protocol.registerHandler('https', ({ request, response }) => { signal = request.signal; response.body = new Readable({ read() {} }); response.status = 200 }, true)
  const response = await protocol.handle(request()); expect(signal?.aborted).toBe(false)
  vi.advanceTimersByTime(30000); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0); (response.body as Readable).destroy()
})
it('cleans completed and failed reads and preserves ordinary protocol signals and methods', async () => {
  vi.useFakeTimers(); const protocol = new LauncherProtocolHandler(), original = new AbortController()
  protocol.registerHandler('https', ({ request, response }) => { if (request.url.pathname === '/fail') throw new Error('Fixture'); response.status = 200; response.body = 'complete' }, true)
  await protocol.handle(request()); expect(vi.getTimerCount()).toBe(0)
  await expect(protocol.handle({ ...request(), url: 'https://api.modrinth.com/fail' })).rejects.toThrow('Fixture'); expect(vi.getTimerCount()).toBe(0)
  const sink = vi.fn(({ request, response }) => { response.status = 200 }); const ordinary = new LauncherProtocolHandler(); ordinary.registerHandler('https', sink, true)
  await ordinary.handle({ url: 'https://provider.example/api', method: 'POST', signal: original.signal, headers: { 'x-grimo-catalog-request': id } })
  expect(sink.mock.calls[0][0].request.signal).toBe(original.signal); expect(sink.mock.calls[0][0].request.method).toBe('POST'); expect(sink.mock.calls[0][0].request.headers).toEqual({})
})
it('rejects malformed local cancellation requests and never cancels an unrelated source', async () => {
  const protocol = new LauncherProtocolHandler()
  expect((await protocol.handle({ url: 'http://launcher/catalog-request/../invalid', method: 'POST' })).status).toBe(404)
  expect((await protocol.handle({ url: `http://launcher/catalog-request/${id}` })).status).toBe(404)
  expect((await protocol.handle({ url: `http://launcher/catalog-request/${id}?extra=1`, method: 'POST' })).status).toBe(404)
  expect((await protocol.handle({ url: `https://remote.example/catalog-request/${id}`, method: 'POST' })).status).toBe(404)
})
it('bounds active reads and early cancellation records without evicting another active read', async () => {
  vi.useFakeTimers(); const protocol = new LauncherProtocolHandler(), bodies: Readable[] = []
  protocol.registerHandler('https', ({ response }) => { const body = new Readable({ read() {} }); bodies.push(body); response.body = body; response.status = 200 }, true)
  const token = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
  for (let i = 0; i < 64; i++) await protocol.handle({ ...request(), headers: { 'x-grimo-catalog-request': token(i) } })
  await expect(protocol.handle({ ...request(), headers: { 'x-grimo-catalog-request': token(64) } })).rejects.toThrow('capacity')
  await expect(protocol.handle({ ...request(), headers: { 'x-grimo-catalog-request': token(0) } })).rejects.toThrow('capacity')
  for (let i = 100; i < 500; i++) await cancel(protocol, token(i))
  expect(vi.getTimerCount()).toBe(64 + 256)
  vi.advanceTimersByTime(30000); expect(vi.getTimerCount()).toBe(0)
  for (const body of bodies) body.destroy()
})
