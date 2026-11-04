import type { ServiceChannels, ServiceKey } from '@xmcl/runtime-api'
import { contextBridge, ipcRenderer } from 'electron'
import EventEmitter from 'events'
import { SharedStateRegistry } from '../../packages/renderer-client/transport'

function createServiceChannels(): ServiceChannels {
  const registry = new SharedStateRegistry((channel, ...args) => ipcRenderer.invoke(channel, ...args), () => {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(100)
    return emitter
  })
  const servicesEmitters = new Map<ServiceKey<any>, WeakRef<EventEmitter>>()
  ipcRenderer.on('state-validating', (_, { id, semaphore, epoch }) => registry.validating(id, semaphore, epoch))
  ipcRenderer.on('commit', (_, id, type, payload, revision, epoch) => registry.mutation(id, type, payload, revision, epoch))
  ipcRenderer.on('service-event', (_, { service, event, args }) => servicesEmitters.get(service)?.deref()?.emit(event, ...args))
  return {
    open(serviceKey) {
      let emitter = servicesEmitters.get(serviceKey)?.deref()
      if (!emitter) {
        emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        servicesEmitters.set(serviceKey, new WeakRef(emitter))
      }
      const events = emitter
      return {
        key: serviceKey,
        on(channel, listener) { events.on(channel as string, listener); return this },
        once(channel, listener) { events.once(channel as string, listener); return this },
        removeListener(channel, listener) { events.removeListener(channel as string, listener); return this },
        async call(method, ...payload) {
          return registry.request('service-call', serviceKey, method, ...payload)
        },
        async callWithTrace(traceContext, method, ...payload) {
          return registry.request('service-call-traced', traceContext, serviceKey, method, ...payload)
        },
      }
    },
  }
}

export const serviceChannels = createServiceChannels()
contextBridge.exposeInMainWorld('serviceChannels', serviceChannels)
