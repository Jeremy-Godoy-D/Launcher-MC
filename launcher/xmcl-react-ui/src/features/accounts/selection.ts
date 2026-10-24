export class StoredSelection {
  private value = ''
  private listeners = new Set<() => void>()
  private error = false
  constructor(
    private key: string,
    private storage: () => Pick<Storage, 'getItem' | 'setItem'>,
    private events: EventTarget,
  ) {
    this.read()
  }
  getSnapshot = () => this.value
  failed = () => this.error
  private read() {
    try {
      this.value = this.storage().getItem(this.key) ?? ''
      this.error = false
    } catch {
      this.error = true
    }
  }
  set = (value: string) => {
    this.value = value
    try {
      this.storage().setItem(this.key, value)
      this.error = false
    } catch {
      this.error = true
    }
    for (const listener of this.listeners) listener()
  }
  private changed = (event: Event) => {
    const change = event as StorageEvent
    if (change.key !== this.key && change.key !== null) return
    try {
      if (change.storageArea && change.storageArea !== this.storage()) return
    } catch {
      this.error = true
    }
    this.read()
    for (const listener of this.listeners) listener()
  }
  subscribe = (listener: () => void) => {
    if (!this.listeners.size) {
      this.read()
      this.events.addEventListener('storage', this.changed)
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) this.events.removeEventListener('storage', this.changed)
    }
  }
}
