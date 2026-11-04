import type { RendererClient, StateData } from '@launcher/renderer-client'
import type { StateDescriptor } from '../../runtime'

/** Acquire through the shared store: never unref a raw state owned by another consumer. */
export function readState<T extends object>(
  client: RendererClient,
  descriptor: StateDescriptor<T>,
  signal: AbortSignal,
) {
  const store = client.state(descriptor.key, descriptor.Type, () => descriptor.load(client))
  return new Promise<StateData<T>>((resolve, reject) => {
    let stop: (() => void) | undefined
    let finished = false
    const finish = (error?: unknown) => {
      if (finished) return
      const value = store.getSnapshot()
      if (!error && value.status === 'loading') return
      finished = true
      signal.removeEventListener('abort', abort)
      queueMicrotask(() => stop?.())
      if (error || value.status === 'error' || !value.data)
        reject(error ?? value.error ?? new Error('State unavailable'))
      else resolve(value.data)
    }
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    stop = store.subscribe(() => finish())
    finish()
  })
}
