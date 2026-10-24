import { EventEmitter } from 'node:events'
import { afterEach, expect, test, vi } from 'vitest'
import { TaskStore } from './tasks'

const running = { id: 'task', type: 'fixture', state: 0, key: 'fixture', substate: {} }
const complete = { ...running, state: 2 }
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function fixture() {
  const events = new EventEmitter()
  const monitor = Object.assign(events, { check: vi.fn().mockResolvedValue(false), poll: vi.fn().mockResolvedValue([]), cancel: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) })
  return { events, monitor, store: new TaskStore(monitor as any) }
}
afterEach(() => { vi.useRealTimers() })

test('multiple consumers and Strict Mode share one activation listener and do not poll while idle', async () => {
  vi.useFakeTimers()
  const { store, events, monitor } = fixture()
  const a = store.subscribe(() => {}); a()
  const b = store.subscribe(() => {}), c = store.subscribe(() => {})
  await settle()
  expect(events.listenerCount('task-activated')).toBe(1)
  expect(monitor.check).toHaveBeenCalledTimes(1)
  expect(monitor.poll).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(monitor.poll).toHaveBeenCalledTimes(1)
  b(); c(); await settle()
  expect(events.listenerCount('task-activated')).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

test('never overlaps polls and performs a final read after deactivation during an in-flight poll', async () => {
  vi.useFakeTimers()
  const { store, monitor, events } = fixture()
  let finish!: (value: any) => void
  monitor.check.mockResolvedValue(true)
  monitor.poll.mockImplementationOnce(() => new Promise(done => { finish = done })).mockResolvedValue([complete])
  const stop = store.subscribe(() => {})
  await settle()
  await vi.advanceTimersByTimeAsync(1000)
  expect(monitor.poll).toHaveBeenCalledTimes(1)
  events.emit('task-activated', false)
  finish([running]); await settle()
  expect(monitor.poll).toHaveBeenCalledTimes(2)
  expect(store.getSnapshot().tasks[0].state).toBe(2)
  expect(store.getSnapshot().active).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(monitor.poll).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
  stop(); await settle()
})

test('new activation events outrank an older initial check response', async () => {
  const { store, monitor, events } = fixture()
  let finish!: (value: boolean) => void
  monitor.check.mockImplementation(() => new Promise(done => { finish = done }))
  const stop = store.subscribe(() => {})
  await Promise.resolve()
  events.emit('task-activated', false)
  finish(true); await settle()
  expect(store.getSnapshot().active).toBe(false)
  stop(); await settle()
})

test('a failed initial activity check still follows running tasks from confirmed polls', async () => {
  vi.useFakeTimers()
  const { store, monitor } = fixture()
  monitor.check.mockRejectedValue(new Error('Check unavailable'))
  monitor.poll.mockResolvedValue([running])
  const stop = store.subscribe(() => {})
  await settle()
  expect(store.getSnapshot().active).toBe(true)
  const before = monitor.poll.mock.calls.length
  monitor.poll.mockResolvedValue([complete])
  await vi.advanceTimersByTimeAsync(250)
  expect(monitor.poll.mock.calls.length).toBeGreaterThan(before)
  expect(store.getSnapshot().active).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  stop(); await settle()
})

test('poll failures stop timers, preserve data and can recover through refresh', async () => {
  vi.useFakeTimers()
  const { store, monitor, events } = fixture()
  monitor.poll.mockResolvedValue([running])
  const stop = store.subscribe(() => {})
  await settle()
  const first = store.getSnapshot()
  monitor.poll.mockRejectedValueOnce(new Error('IPC unavailable'))
  events.emit('task-activated', true)
  await settle()
  expect(store.getSnapshot().error?.message).toBe('IPC unavailable')
  expect(store.getSnapshot().tasks).toBe(first.tasks)
  expect(vi.getTimerCount()).toBe(0)
  monitor.poll.mockResolvedValue([complete])
  await store.refresh()
  expect(store.getSnapshot().error).toBeUndefined()
  expect(first.tasks[0].state).toBe(0)
  expect(store.getSnapshot().tasks[0].state).toBe(2)
  stop(); await settle()
})

test('clear waits for the native operation and confirms data instead of optimistically deleting it', async () => {
  const { store, monitor } = fixture()
  monitor.poll.mockResolvedValue([complete])
  let finish!: () => void
  monitor.clear.mockImplementation(() => new Promise<void>(done => { finish = done }))
  const stop = store.subscribe(() => {})
  await settle()
  const clearing = store.clear()
  expect(store.getSnapshot().tasks).toHaveLength(1)
  monitor.poll.mockResolvedValue([])
  finish(); await clearing
  expect(store.getSnapshot().tasks).toHaveLength(0)
  monitor.cancel.mockRejectedValueOnce(new Error('Cancel rejected'))
  await expect(store.cancel('task')).rejects.toThrow('Cancel rejected')
  expect(store.getSnapshot().error?.message).toBe('Cancel rejected')
  stop(); await settle()
})

test('late poll results do not notify disposed consumers or leave listeners', async () => {
  const { store, monitor, events } = fixture()
  let finish!: (value: any) => void
  monitor.poll.mockImplementation(() => new Promise(done => { finish = done }))
  const listener = vi.fn(), stop = store.subscribe(listener)
  await settle(); stop(); await settle()
  const calls = listener.mock.calls.length
  finish([running]); await settle()
  expect(listener).toHaveBeenCalledTimes(calls)
  expect(store.getSnapshot().tasks).toHaveLength(0)
  expect(events.listenerCount('task-activated')).toBe(0)
  store.dispose()
  await expect(store.refresh()).rejects.toThrow('disposed')
})
