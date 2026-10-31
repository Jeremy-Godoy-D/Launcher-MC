import type { TaskMonitor, Tasks } from '@xmcl/runtime-api'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { freezeData } from './state'

export type TaskSnapshot = Readonly<{ tasks: readonly Readonly<Tasks>[]; active: boolean; loading: boolean; error?: Error; revision: number }>

export class TaskStore {
  private listeners = new Set<() => void>()
  private snapshot: TaskSnapshot = Object.freeze({ tasks: Object.freeze([]), active: false, loading: false, revision: 0 })
  private timer?: ReturnType<typeof setTimeout>
  private polling?: Promise<void>
  private requested = false
  private generation = 0
  private activationRevision = 0
  private started = false
  private disposed = false
  private activityKnown = false

  constructor(private monitor: TaskMonitor) {}
  getSnapshot = () => this.snapshot

  private publish(update: Partial<TaskSnapshot>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...update, revision: this.snapshot.revision + 1 })
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void) => {
    if (this.disposed) throw new Error('Task store disposed')
    this.listeners.add(listener)
    if (!this.started) this.start()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.listeners.delete(listener)
      queueMicrotask(() => { if (this.listeners.size === 0) this.stop() })
    }
  }

  private activated = (active: boolean) => {
    this.activationRevision++
    this.activityKnown = true
    clearTimeout(this.timer)
    this.publish({ active })
    void this.refresh()
  }

  private start() {
    this.started = true
    this.activityKnown = false
    const generation = ++this.generation
    const revision = this.activationRevision
    this.monitor.on('task-activated', this.activated)
    void Promise.resolve().then(() => this.monitor.check()).then(active => {
      if (generation !== this.generation || !this.started) return
      if (revision === this.activationRevision) {
        this.activityKnown = true
        clearTimeout(this.timer)
        this.publish({ active })
      }
      if (this.snapshot.active) void this.refresh()
    }).catch(error => {
      if (generation === this.generation && this.started && !this.activityKnown) {
        this.publish({ error: this.error(error), active: this.snapshot.tasks.some(task => task.state === TaskState.Running) })
        if (this.snapshot.active) void this.refresh()
      }
    })
    void this.refresh()
  }

  private error(error: unknown) {
    return error instanceof Error ? error : new Error('No se pudieron consultar las tareas', { cause: error })
  }

  refresh = (): Promise<void> => {
    if (this.disposed) return Promise.reject(new Error('Task store disposed'))
    if (!this.started || this.listeners.size === 0) return Promise.resolve()
    this.requested = true
    clearTimeout(this.timer)
    if (this.polling) return this.polling
    this.polling = Promise.resolve().then(async () => {
      while (this.requested && this.started && this.listeners.size > 0) {
        this.requested = false
        const generation = this.generation
        this.publish({ loading: true })
        try {
          const tasks = await this.monitor.poll()
          if (generation === this.generation && this.started) this.publish({
            tasks: freezeData(structuredClone(tasks)), error: undefined,
            active: this.activityKnown ? this.snapshot.active : tasks.some(task => task.state === TaskState.Running),
          })
        } catch (error) {
          if (generation === this.generation && this.started) this.publish({ error: this.error(error), active: false })
        }
      }
    }).finally(() => {
      this.polling = undefined
      if (!this.started) return
      this.publish({ loading: false })
      if (this.snapshot.active && this.listeners.size > 0) this.timer = setTimeout(() => { void this.refresh() }, 250)
    })
    return this.polling
  }

  cancel = async (id: string) => {
    if (this.disposed) throw new Error('Task store disposed')
    try { await this.monitor.cancel(id); await this.refresh() }
    catch (error) { this.publish({ error: this.error(error) }); throw error }
  }

  clear = async () => {
    if (this.disposed) throw new Error('Task store disposed')
    try { await this.monitor.clear(); await this.refresh() }
    catch (error) { this.publish({ error: this.error(error) }); throw error }
  }

  private stop() {
    if (!this.started) return
    this.started = false
    this.generation++
    clearTimeout(this.timer)
    this.monitor.removeListener('task-activated', this.activated)
    this.publish({ active: false, loading: false })
  }

  dispose() { this.disposed = true; this.listeners.clear(); this.stop() }
}
