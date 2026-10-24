import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { StateStore } from './state'
import { RendererClient } from './index'

class BaseState {
  value: string | null = null
  valueSet(value: string | null) { this.value = value }
}
class Model extends BaseState {
  rows = [{ name: 'first' }]
  optional: string | undefined = undefined
  rowSet(name: string) { this.rows[0].name = name }
  reject() { this.rows[0].name = 'invalid'; throw new Error('Rejected mutation') }
}

function transport() {
  const events = new EventEmitter()
  const value = Object.assign(new Model(), {
    id: 'test-state',
    subscribe: vi.fn((key, fn) => { events.on(key, fn); return value }),
    unsubscribe: vi.fn((key, fn) => { events.off(key, fn); return value }),
    subscribeAll: vi.fn(fn => { events.on('*', fn); return value }),
    unsubscribeAll: vi.fn(fn => { events.off('*', fn); return value }),
    unref: vi.fn(), revalidate: vi.fn().mockResolvedValue(undefined), commit: vi.fn().mockResolvedValue(undefined),
  })
  return { value, events, mutate: (key: string, payload?: unknown) => events.emit('*', key, payload) }
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

describe('shared immutable state', () => {
  test.each([0, 1, 2, 3, 4, 5, 6, 7])('remount during any load continuation stays live and releases each acquisition, offset %i', async offset => {
    const raw = transport(), fetch = vi.fn(async () => raw.value)
    const store = new StateStore(Model, fetch)
    const first = store.subscribe(() => {})
    first()
    for (let i = 0; i < offset; i++) await Promise.resolve()
    const second = store.subscribe(() => {})
    await settle(); await settle()
    expect(store.getSnapshot().status).toBe('ready')
    expect(raw.events.listenerCount('*')).toBe(1)
    second(); await settle(); await settle()
    expect(raw.events.listenerCount('*')).toBe(0)
    expect(raw.value.unref).toHaveBeenCalledTimes(fetch.mock.calls.length)
  })
  test('aliases of the same server identity share one mutation handler and the exact snapshot', async () => {
    const raw = transport(), client = new RendererClient({ open: vi.fn() } as any)
    const a = client.state('view-a', Model, async () => raw.value)
    const b = client.state('view-b', Model, async () => raw.value)
    const stopA = a.subscribe(() => {}), stopB = b.subscribe(() => {})
    await settle(); await settle()
    expect(raw.events.listenerCount('*')).toBe(1)
    raw.mutate('rowSet', 'shared')
    expect(a.getSnapshot()).toBe(b.getSnapshot())
    expect(b.getSnapshot().data?.rows[0].name).toBe('shared')
    stopA(); await settle()
    expect(raw.value.unref).not.toHaveBeenCalled()
    stopB(); await settle(); await settle()
    expect(raw.value.unref).toHaveBeenCalledTimes(1)
  })
  test('keeps stable snapshots, inherited mutations and null/undefined; previous nested data cannot change', async () => {
    const raw = transport()
    const store = new StateStore(Model, async () => raw.value)
    const unsubscribe = store.subscribe(() => {})
    await settle()
    const first = store.getSnapshot()
    expect(first).toBe(store.getSnapshot())
    expect(first.data?.value).toBeNull()
    expect(first.data).toHaveProperty('optional', undefined)
    raw.mutate('valueSet', 'updated')
    raw.mutate('rowSet', 'second')
    expect(first.data?.rows[0].name).toBe('first')
    expect(store.getSnapshot().data?.rows[0].name).toBe('second')
    expect(raw.value.rows[0].name).toBe('first')
    expect(() => { (first.data!.rows[0] as any).name = 'bad' }).toThrow()
    await store.commit('valueSet', null)
    expect(raw.value.commit).toHaveBeenCalledWith('valueSet', null)
    raw.mutate('valueSet', null)
    expect(store.getSnapshot().data?.value).toBeNull()
    unsubscribe(); await settle()
    expect(raw.value.unref).toHaveBeenCalledTimes(1)
    expect(raw.events.listenerCount('*')).toBe(0)
  })

  test('one load and handler for multiple consumers, including a Strict Mode subscribe/unsubscribe cycle', async () => {
    const raw = transport(), fetch = vi.fn(async () => raw.value)
    const client = new RendererClient({ open: vi.fn() } as any)
    const store = client.state('shared', Model, fetch)
    expect(client.state('shared', Model, fetch)).toBe(store)
    const first = store.subscribe(() => {})
    first()
    const second = store.subscribe(() => {})
    const third = store.subscribe(() => {})
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(raw.events.listenerCount('*')).toBe(1)
    second(); await settle()
    expect(raw.value.unref).not.toHaveBeenCalled()
    third(); await settle()
    expect(raw.value.unref).toHaveBeenCalledTimes(1)
    expect(raw.events.eventNames()).toEqual([])
  })

  test('late result after unmount is released without retaining listeners or publishing stale data', async () => {
    const raw = transport()
    let resolve!: (value: typeof raw.value) => void
    const store = new StateStore(Model, () => new Promise(done => { resolve = done }))
    const listener = vi.fn(), unsubscribe = store.subscribe(listener)
    await settle(); unsubscribe(); await settle()
    const count = listener.mock.calls.length
    resolve(raw.value); await settle()
    expect(listener).toHaveBeenCalledTimes(count)
    expect(raw.value.unref).toHaveBeenCalledTimes(1)
    expect(raw.events.eventNames()).toEqual([])
    expect(store.getSnapshot().data).toBeUndefined()
  })

  test('queued mutations during subscription appear in the first ready snapshot', async () => {
    const raw = transport()
    const original = raw.value.subscribeAll
    raw.value.subscribeAll = vi.fn(fn => { original(fn); fn('rowSet', 'queued'); return raw.value })
    const store = new StateStore(Model, async () => raw.value)
    const stop = store.subscribe(() => {})
    await settle()
    expect(store.getSnapshot().data?.rows[0].name).toBe('queued')
    stop(); await settle()
  })

  test('rejects unknown or failing mutations without changing the last valid state', async () => {
    const raw = transport(), store = new StateStore(Model, async () => raw.value)
    const stop = store.subscribe(() => {})
    await settle()
    raw.mutate('constructor')
    expect(store.getSnapshot().status).toBe('error')
    raw.mutate('reject')
    expect(store.getSnapshot().error?.message).toBe('Rejected mutation')
    expect(store.getSnapshot().data?.rows[0].name).toBe('first')
    stop(); await settle()
  })

  test('serializes revalidation and preserves overlapping remote validation', async () => {
    const raw = transport(), store = new StateStore(Model, async () => raw.value)
    let finish!: () => void
    raw.value.revalidate.mockImplementation(() => new Promise<void>(done => { finish = done }))
    const stop = store.subscribe(() => {})
    await settle()
    const first = store.revalidate(), second = store.revalidate()
    expect(first).toBe(second)
    await settle()
    raw.events.emit('state-validating', 2)
    finish(); await first
    expect(raw.value.revalidate).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().validating).toBe(true)
    raw.events.emit('state-validating', 0)
    expect(store.getSnapshot().validating).toBe(false)
    stop(); await settle()
  })

  test('load errors are visible and a remount can recover; dispose releases a pending state once', async () => {
    const raw = transport(), fetch = vi.fn().mockRejectedValueOnce({ message: 'Network error' }).mockResolvedValue(raw.value)
    const store = new StateStore(Model, fetch)
    const stop = store.subscribe(() => {})
    await settle(); expect(store.getSnapshot().error?.message).toBe('Network error')
    stop(); await settle()
    const next = store.subscribe(() => {})
    await settle(); expect(store.getSnapshot().status).toBe('ready')
    store.dispose(); next(); await settle()
    expect(raw.value.unref).toHaveBeenCalledTimes(1)
  })
})
