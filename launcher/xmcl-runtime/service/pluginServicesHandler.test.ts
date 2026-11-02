import { expect, it, vi } from 'vitest'
import { setImmediate } from 'node:timers/promises'
import { AbstractService, ExposeServiceKey } from './Service'
import { pluginServicesHandler } from './pluginServicesHandler'

vi.mock('~/infra', () => ({
  runWithServiceTrace: (_context: unknown, _service: string, _method: string, run: () => unknown) => run(),
  runWithRendererServiceTrace: (_context: unknown, _service: string, _method: string, run: () => unknown) => run(),
  trackRuntimeExceptionOnce: vi.fn(),
}))
vi.mock('~/infra/errors', () => ({
  getSerializedError: async (error: Error) => ({ name: error.name, message: error.message }),
  getNormalizeException: async () => undefined,
  getServiceFailureCategory: () => 'unknown',
}))

function setup(fail = false) {
  let release!: () => void, started!: () => void, ready = false
  const gate = new Promise<void>(resolve => { release = resolve }), beginning = new Promise<void>(resolve => { started = resolve })
  const read = vi.fn(() => ready), initialize = vi.fn(async () => { started(); await gate; if (fail) throw new Error('Initialization failed'); ready = true })
  const handlers = new Map<string, (...args: any[]) => Promise<any>>(), logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
  let service: SlowService
  const app = { controller: { handle: (name: string, fn: any) => handlers.set(name, fn) }, getLogger: () => logger, emit: vi.fn(), disposed: false, registryDisposer: vi.fn(), registry: { register: vi.fn(), getOrCreate: async () => service } }
  class SlowService extends AbstractService {
    constructor() { super(app as any, initialize) }
    read = read
  }
  ExposeServiceKey('SlowService' as any)(SlowService); service = new SlowService()
  pluginServicesHandler([SlowService])(app as any, {} as any)
  const call = (traced: boolean) => traced ? handlers.get('service-call-traced')!({ sender: {} }, {}, 'SlowService', 'read') : handlers.get('service-call')!({ sender: {} }, 'SlowService', 'read')
  return { call, release, beginning, read, initialize }
}

it.each([false, true])('cached RPC calls await the same initialization before reading (traced=%s)', async traced => {
  const fixture = setup(), first = fixture.call(false); await fixture.beginning
  const second = fixture.call(traced)
  try { await setImmediate(); expect(fixture.read).not.toHaveBeenCalled() }
  finally { fixture.release() }
  expect(await Promise.all([first, second])).toEqual([{ result: true }, { result: true }])
  expect(fixture.initialize).toHaveBeenCalledOnce()
})

it('cached RPC calls cannot execute a service whose initialization failed', async () => {
  const fixture = setup(true), first = fixture.call(false); await fixture.beginning; fixture.release()
  expect(await first).toEqual({ error: { name: 'Error', message: 'Initialization failed' } })
  expect(await fixture.call(true)).toEqual({ error: { name: 'Error', message: 'Initialization failed' } })
  expect(fixture.read).not.toHaveBeenCalled(); expect(fixture.initialize).toHaveBeenCalledOnce()
})
