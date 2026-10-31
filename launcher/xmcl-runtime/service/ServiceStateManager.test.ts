import { EventEmitter } from 'node:events'
import { describe, expect, it, test, vi } from 'vitest'
import type { Client, LauncherApp } from '~/app'
import { ServiceStateManager } from './ServiceStateManager'

class TestState {
  value = 0

  valueSet(value: number) {
    this.value = value
  }
}

class TestClient extends EventEmitter implements Client {
  readonly send = vi.fn()
  private destroyed = false

  isDestroyed() {
    return this.destroyed
  }

  destroy() {
    this.destroyed = true
    this.emit('destroyed')
  }

  disconnectRenderer() {
    this.emit('renderer-disconnected')
  }
}

describe('ServiceStateManager', () => {
  it('uses one lifecycle listener pair for all states tracked by a client', () => {
    const app = {
      controller: { handle: vi.fn() },
      disposed: false,
      getLogger: vi.fn(() => ({ error: vi.fn() })),
      registryDisposer: vi.fn(),
    } as unknown as LauncherApp
    const manager = new ServiceStateManager(app)
    const client = new TestClient()
    const states = Array.from({ length: 12 }, (_, index) => {
      const state = new TestState()
      manager.registerStatic(state, `state-${index}`)
      manager.serializeAndTrack(client, state as any)
      return state
    })

    expect(client.listenerCount('destroyed')).toBe(1)
    expect(client.listenerCount('renderer-disconnected')).toBe(1)
    states[0].valueSet(1)
    expect(client.send).toHaveBeenCalledOnce()

    client.disconnectRenderer()
    states[0].valueSet(2)
    expect(client.send).toHaveBeenCalledOnce()
    expect(client.listenerCount('destroyed')).toBe(0)
    expect(client.listenerCount('renderer-disconnected')).toBe(0)

    manager.serializeAndTrack(client, states[0] as any)
    states[0].valueSet(3)
    expect(client.send).toHaveBeenCalledTimes(2)
    expect(client.listenerCount('destroyed')).toBe(1)
    expect(client.listenerCount('renderer-disconnected')).toBe(1)

    client.destroy()
    states[0].valueSet(4)
    expect(client.send).toHaveBeenCalledTimes(2)
    expect(client.listenerCount('destroyed')).toBe(0)
    expect(client.listenerCount('renderer-disconnected')).toBe(0)
  })
})

test('state IPC checks acquiring window and generation; stale unref cannot release a new resource', async () => {
  const handlers = new Map<string, Function>()
  const manager = new ServiceStateManager({
    getLogger: () => ({ error: vi.fn() }),
    controller: { handle: (name: string, fn: Function) => handlers.set(name, fn) },
    registryDisposer: vi.fn(), emit: vi.fn(),
  } as any)
  class Model { value = 0; valueSet(value: number) { this.value = value } }
  const client = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  const other = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  expect(await handlers.get('commit')!({ sender: other }, '__proto__', 'toString', undefined)).toBe('NOT_STATE_SERVICE')
  const firstDispose = vi.fn(), secondDispose = vi.fn()
  const first = await manager.registerOrGet('same', async () => [new Model(), firstDispose])
  const initial = manager.serializeAndTrack(client as any, first)
  await expect(handlers.get('commit')!({ sender: other }, 'same', 'valueSet', 1, initial.__stateEpoch__)).rejects.toThrow('State not acquired')
  await expect(handlers.get('revalidate')!({ sender: other }, 'same', initial.__stateEpoch__)).rejects.toThrow('State not acquired')
  await handlers.get('unref')!({ sender: client }, 'same', initial.__stateEpoch__)
  expect(firstDispose).toHaveBeenCalledTimes(1)
  const second = await manager.registerOrGet('same', async () => [new Model(), secondDispose])
  const current = manager.serializeAndTrack(client as any, second)
  expect(current.__stateEpoch__).not.toBe(initial.__stateEpoch__)
  await expect(handlers.get('commit')!({ sender: client }, 'same', 'valueSet', 1, initial.__stateEpoch__)).rejects.toThrow('State expired')
  await handlers.get('unref')!({ sender: client }, 'same', initial.__stateEpoch__)
  expect(secondDispose).not.toHaveBeenCalled()
  await handlers.get('commit')!({ sender: client }, 'same', 'valueSet', 3, current.__stateEpoch__)
  expect(second.value).toBe(3)
  await handlers.get('unref')!({ sender: client }, 'same', current.__stateEpoch__)
  expect(secondDispose).toHaveBeenCalledTimes(1)
})
