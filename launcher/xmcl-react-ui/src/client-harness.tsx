// Development-only contract harness: intentionally absent from the production Vite inputs.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ServiceChannel, ServiceChannels, ServiceKey, TaskMonitor } from '@xmcl/runtime-api'
import { InstanceServiceKey, InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { RendererClient } from '@launcher/renderer-client'
import { RuntimeProvider, useService, useSharedState, useTasks, type StateDescriptor } from './runtime'
import './styles.css'

const metrics = { reads: 0, subscriptions: 0, unrefs: 0, effects: 0, cleanups: 0, taskPolls: 0, taskListeners: 0, taskActivePolls: 0, maxTaskPolls: 0 }
const native = window.serviceChannels!
const channels: ServiceChannels = {
  open<T>(key: ServiceKey<T>) {
    const channel = native.open(key)
    return { ...channel, async call(method, ...args) {
      const result = await channel.call(method, ...args)
      if (!result || typeof result !== 'object' || !('subscribeAll' in result)) return result
      metrics.reads++
      const raw = result as any
      const subscribed = new Set<unknown>()
      return { ...raw,
        subscribeAll: (listener: any) => { if (!subscribed.has(listener)) { subscribed.add(listener); metrics.subscriptions++ }; return raw.subscribeAll(listener) },
        unsubscribeAll: (listener: any) => { if (subscribed.delete(listener)) metrics.subscriptions--; return raw.unsubscribeAll(listener) },
        unref: () => { metrics.unrefs++; return raw.unref() },
      }
    } } as ServiceChannel<T>
  },
}
const nativeTasks = window.taskMonitor!
const taskListeners = new Set<unknown>()
const monitor: TaskMonitor = { ...nativeTasks,
  async poll() {
    metrics.taskPolls++; metrics.taskActivePolls++
    metrics.maxTaskPolls = Math.max(metrics.maxTaskPolls, metrics.taskActivePolls)
    try { return await nativeTasks.poll() } finally { metrics.taskActivePolls-- }
  },
  on(event, listener) {
    if (!taskListeners.has(listener)) { taskListeners.add(listener); metrics.taskListeners++ }
    nativeTasks.on(event, listener)
    return this
  },
  removeListener(event, listener) {
    if (taskListeners.delete(listener)) metrics.taskListeners--
    nativeTasks.removeListener(event, listener)
    return this
  },
}
const client = new RendererClient(channels, monitor)
const descriptor: StateDescriptor<InstanceState> = { key: 'instances', Type: InstanceState, load: client => client.service(InstanceServiceKey).getSharedInstancesState() }
let snapshots: unknown[] = []
let lastInitial: any

declare global { interface Window { readClientHarness: () => object } }
window.readClientHarness = () => ({ ...metrics, sameSnapshot: snapshots.length > 0 && snapshots.every(value => value === snapshots[0]), initialCount: lastInitial?.data?.instances.length, initialName: lastInitial?.data?.instances[0]?.name })

function Reader({ index, alias = false }: { index: number; alias?: boolean }) {
  const snapshot = useSharedState(alias ? { ...descriptor, key: 'instances-alias' } : descriptor)
  snapshots[index] = snapshot
  if (!lastInitial && snapshot.status === 'ready') lastInitial = snapshot
  useEffect(() => { metrics.effects++; return () => { metrics.cleanups++; delete snapshots[index] } }, [])
  return <output data-testid={`state-reader-${index}`} data-status={snapshot.status} data-count={snapshot.data?.instances.length}>
    {snapshot.error?.message ?? snapshot.data?.instances.map(instance => instance.name).join(', ') ?? 'Cargando'}
  </output>
}

function TaskReader({ index }: { index: number }) {
  const snapshot = useTasks()
  return <output data-testid={`task-reader-${index}`} data-loading={snapshot.loading}>{snapshot.error?.message ?? snapshot.tasks.length}</output>
}

function Harness() {
  const [mounted, setMounted] = useState(true)
  const [alias, setAlias] = useState(false)
  const [error, setError] = useState('')
  const service = useService(InstanceServiceKey)
  return <main className="auxiliary">
    <h1>Contrato de estado · pruebas</h1>
    <button className="button primary" onClick={() => setMounted(value => !value)}>{mounted ? 'Desmontar consumidores' : 'Montar consumidores'}</button>
    <button className="button secondary" onClick={() => setAlias(true)}>Añadir vista alternativa</button>
    <button className="button secondary" onClick={() => { void service.createInstance({ name: 'Renderer Client QA', runtime: { minecraft: '1.20.4' } }).catch(error => setError(error.message)) }}>Crear instancia de prueba</button>
    {error && <p role="alert">{error}</p>}
    {mounted && <><Reader index={0} /><Reader index={1} />{alias && <Reader index={2} alias />}<TaskReader index={0} /><TaskReader index={1} /></>}
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><RuntimeProvider client={client}><Harness /></RuntimeProvider></StrictMode>)
window.addEventListener('pagehide', () => client.dispose(), { once: true })
