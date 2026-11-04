import { expect, test, vi } from 'vitest'
import { RendererClient } from './index'
import type { GenericEventEmitter, ServiceKey } from '@xmcl/runtime-api'

test('typed service proxy caches methods, preserves payloads and events, and is not thenable', async () => {
  interface Service { save(value: unknown, optional?: unknown): Promise<unknown>; on(event: string, fn: () => void): Service }
  const call = vi.fn().mockResolvedValue({ ok: false, message: 'Domain result' }), on = vi.fn()
  const channels = { open: vi.fn(() => ({ call, on })) }
  const client = new RendererClient(channels as any)
  const key: ServiceKey<Service> = 'TestService'
  const service = client.service(key)
  const payload: any = { reset: null, bytes: new Uint8Array([1, 2]), optional: undefined }
  payload.self = payload
  expect(service).toBe(client.service(key))
  expect(service.save).toBe(service.save)
  await expect(service.save(payload, undefined)).resolves.toEqual({ ok: false, message: 'Domain result' })
  expect(call).toHaveBeenCalledWith('save', payload, undefined)
  expect(call.mock.calls[0][1]).toBe(payload)
  expect(await Promise.resolve(service)).toBe(service)
  const listener = () => {}
  expect(service.on('changed', listener)).toBe(service)
  expect(on).toHaveBeenCalledWith('changed', listener)
  expect(channels.open).toHaveBeenCalledTimes(1)
  expect((service as any).__proto__).toBeUndefined()
})

test('service events have explicit idempotent cleanup and client disposal blocks stale actions', async () => {
  interface Service extends GenericEventEmitter<{ changed: number }> { run(): Promise<void> }
  const on = vi.fn(), removeListener = vi.fn(), call = vi.fn()
  const client = new RendererClient({ open: () => ({ on, removeListener, call }) } as any)
  const key: ServiceKey<Service> = 'Events'
  const fn = vi.fn()
  const stop = client.listen(key, 'changed', fn)
  expect(on).toHaveBeenCalledWith('changed', fn)
  stop(); stop()
  expect(removeListener).toHaveBeenCalledTimes(1)
  client.listen(key, 'changed', fn)
  const service = client.service(key)
  client.dispose()
  expect(removeListener).toHaveBeenCalledTimes(2)
  await expect(service.run()).rejects.toThrow('disposed')
  expect(call).not.toHaveBeenCalled()
})

test('different descriptors sharing a transport ID do not release each other, including an outstanding read', async () => {
  class Model { value = 1 }
  const raw = { id: 'same-id', value: 1, subscribe: vi.fn(), subscribeAll: vi.fn(), unsubscribe: vi.fn(), unsubscribeAll: vi.fn(), unref: vi.fn() }
  let finish!: (value: any) => void
  const client = new RendererClient({ open: vi.fn() } as any)
  const a = client.state('first-view', Model, async () => raw as any)
  const b = client.state('second-view', Model, () => new Promise<any>(done => { finish = done }))
  const stopA = a.subscribe(() => {}), stopB = b.subscribe(() => {})
  for (let i = 0; i < 12; i++) await Promise.resolve()
  stopA()
  for (let i = 0; i < 6; i++) await Promise.resolve()
  expect(raw.unref).not.toHaveBeenCalled()
  finish(raw)
  for (let i = 0; i < 12; i++) await Promise.resolve()
  expect(b.getSnapshot().status).toBe('ready')
  stopB()
  for (let i = 0; i < 6; i++) await Promise.resolve()
  expect(raw.unref).toHaveBeenCalledTimes(1)
})
