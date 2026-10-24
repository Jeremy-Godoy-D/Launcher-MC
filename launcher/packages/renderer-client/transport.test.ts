import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { SharedStateRegistry } from './transport'

function fixture() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  const registry = new SharedStateRegistry(invoke, () => new EventEmitter())
  const snapshot = (value = 0, revision?: number) => {
    invoke.mockResolvedValueOnce({ result: { __state__: 'Model', __stateRevision__: revision, id: 'state', value } })
    return registry.request('service-call', 'Test', 'getState')
  }
  return { registry, invoke, snapshot }
}

describe('state transport ordering and lifetime', () => {
  test('reentrant delivery keeps sequence order and does not wait for a later unrelated event', async () => {
    const { registry, snapshot } = fixture()
    const state = await snapshot(0, 0)
    const order: number[] = []
    state.subscribeAll((_method: string, value: number) => {
      order.push(value)
      if (value === 1) registry.mutation('state', 'increment', 2, 2)
    })
    registry.mutation('state', 'increment', 3, 3)
    registry.mutation('state', 'increment', 1, 1)
    expect(order).toEqual([1, 2, 3])
  })
  test('late commits from a released resource cannot modify a new resource with the same ID', async () => {
    const { registry, invoke } = fixture()
    const old = await registry.receive({ result: { __state__: 'Model', id: 'state', value: 0, __stateRevision__: 0, __stateEpoch__: 'old' } })
    await old.unref()
    registry.mutation('state', 'increment', 100, 1, 'old')
    const current = await registry.receive({ result: { __state__: 'Model', id: 'state', value: 0, __stateRevision__: 0, __stateEpoch__: 'current' } })
    current.subscribeAll((_method: string, value: number) => { current.value += value })
    registry.mutation('state', 'increment', 2, 1, 'current')
    expect(current.value).toBe(2)
    await current.commit('increment', 3)
    expect(invoke).toHaveBeenCalledWith('commit', 'state', 'increment', 3, 'current')
    await current.unref()
    expect(invoke).toHaveBeenCalledWith('unref', 'state', 'current')
  })
  test('buffers before response and after response until a consumer subscribes', async () => {
    const { registry, snapshot } = fixture()
    const reading = snapshot(0, 0)
    registry.mutation('state', 'increment', 1, 1)
    const state = await reading
    registry.mutation('state', 'increment', 2, 2)
    await Promise.resolve()
    state.subscribeAll((_method: string, value: number) => { state.value += value })
    expect(state.value).toBe(3)
  })

  test('does not replay changes already included in the initial snapshot; duplicate and reordered events apply once', async () => {
    const { registry, snapshot } = fixture()
    const reading = snapshot(10, 1)
    registry.mutation('state', 'increment', 10, 1)
    registry.mutation('state', 'increment', 1, 2)
    const state = await reading
    const received: number[] = []
    state.subscribeAll((_method: string, value: number) => { received.push(value); state.value += value })
    registry.mutation('state', 'increment', 3, 4)
    expect(state.value).toBe(11)
    registry.mutation('state', 'increment', 2, 3)
    registry.mutation('state', 'increment', 1, 2)
    expect(received).toEqual([1, 2, 3])
    expect(state.value).toBe(16)
  })

  test('legacy unversioned states still deliver FIFO and typed listeners', async () => {
    const { registry, snapshot } = fixture()
    const reading = snapshot()
    registry.mutation('state', 'set', null)
    const state = await reading
    const listener = vi.fn()
    state.subscribe('set', listener)
    registry.mutation('state', 'set', undefined)
    expect(listener.mock.calls).toEqual([[null], [undefined]])
    state.unsubscribe('set', listener)
  })

  test('preserves initial remote validation and returns revalidation promises', async () => {
    const { registry, invoke, snapshot } = fixture()
    const reading = snapshot()
    registry.validating('state', 2)
    const state = await reading
    const listener = vi.fn()
    state.subscribe('state-validating', listener)
    expect(listener).toHaveBeenLastCalledWith(2)
    registry.validating('state', 0)
    expect(listener).toHaveBeenLastCalledWith(0)
    await state.revalidate()
    expect(invoke).toHaveBeenCalledWith('revalidate', 'state', undefined)
  })

  test('explicit release is idempotent and a later acquisition is independent', async () => {
    const { snapshot, invoke } = fixture()
    const old = await snapshot(1, 0)
    expect(old.__state__).toBeUndefined()
    expect(old.__stateRevision__).toBeUndefined()
    await old.unref(); await old.unref()
    const current = await snapshot(2, 0)
    await old.unref()
    expect(invoke.mock.calls.filter(call => call[0] === 'unref')).toHaveLength(1)
    await current.unref()
    expect(invoke.mock.calls.filter(call => call[0] === 'unref')).toHaveLength(2)
  })

  test('propagates domain errors and rejects malformed identities or revisions', async () => {
    const { registry } = fixture()
    const error = { name: 'DomainError', message: 'Rejected' }
    await expect(registry.receive({ error })).rejects.toBe(error)
    await expect(registry.receive({ result: { __state__: 'Model', id: {} } })).rejects.toThrow('identity')
    await expect(registry.receive({ result: { __state__: 'Model', id: 'state', __stateRevision__: -1 } })).rejects.toThrow('revision')
    expect(() => registry.mutation('state', 'set', 1, NaN)).toThrow('revision')
  })
})
