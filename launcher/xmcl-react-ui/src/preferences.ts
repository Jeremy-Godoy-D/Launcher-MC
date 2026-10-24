export type ReactUiPreferencesV1 = Readonly<{
  version: 1
  appearance: 'system' | 'dark' | 'light'
  performanceMode: boolean
  backgroundVideoEnabled: boolean
  carouselEnabled: boolean
  libraryView: 'grid' | 'list'
}>

export const PREFERENCES_KEY = 'launcher.react.preferences'
const defaults: ReactUiPreferencesV1 = Object.freeze({ version: 1, appearance: 'system', performanceMode: false, backgroundVideoEnabled: true, carouselEnabled: true, libraryView: 'grid' })
type Snapshot = Readonly<{ preferences: ReactUiPreferencesV1; error?: 'storage' | 'invalid' | 'newer-version' | 'migration' }>
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>

function appearance(value: unknown): ReactUiPreferencesV1['appearance'] | undefined {
  if (value === true || value === 'dark') return 'dark'
  if (value === false || value === 'light') return 'light'
  if (value === 'system') return 'system'
}

function parse(value: unknown): ReactUiPreferencesV1 {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) throw new Error('Invalid preferences')
  const data = value as Record<string, unknown>
  if (!['system', 'dark', 'light'].includes(String(data.appearance)) || !['grid', 'list'].includes(String(data.libraryView)) || ['performanceMode', 'backgroundVideoEnabled', 'carouselEnabled'].some(key => typeof data[key] !== 'boolean')) throw new Error('Invalid preferences')
  return Object.freeze({ version: 1, appearance: data.appearance as ReactUiPreferencesV1['appearance'], libraryView: data.libraryView as 'grid' | 'list', performanceMode: data.performanceMode as boolean, backgroundVideoEnabled: data.backgroundVideoEnabled as boolean, carouselEnabled: data.carouselEnabled as boolean })
}

export class PreferencesStore {
  private snapshot: Snapshot = Object.freeze({ preferences: defaults })
  private listeners = new Set<() => void>()
  private initialization?: Promise<void>
  private revision = 0
  private writable = true

  constructor(private storage: StorageAccess, private events: EventTarget, private readLegacyAppearance?: () => Promise<unknown>) {}
  getSnapshot = () => this.snapshot

  private publish(preferences: ReactUiPreferencesV1, error?: Snapshot['error']) {
    this.snapshot = Object.freeze({ preferences, error })
    for (const listener of this.listeners) listener()
  }

  private readSaved(value: string) {
    const data = JSON.parse(value)
    if (data && typeof data.version === 'number' && data.version > 1) {
      this.writable = false
      this.publish(this.snapshot.preferences, 'newer-version')
    } else {
      this.writable = true
      this.publish(parse(data))
    }
  }

  initialize = () => this.initialization ??= this.load()

  private async load() {
    const revision = this.revision
    let migrated = defaults
    try {
      const storage = this.storage()
      const saved = storage.getItem(PREFERENCES_KEY)
      if (saved !== null) { try { this.readSaved(saved) } catch { this.publish(defaults, 'invalid') }; return }
      migrated = Object.freeze({ ...defaults, performanceMode: storage.getItem('aurora.performanceMode') === 'true' })
      this.publish(migrated)
      const legacy = appearance(storage.getItem('darkTheme')) ?? appearance(await this.readLegacyAppearance?.())
      if (revision !== this.revision) return
      this.publish(Object.freeze({ ...migrated, appearance: legacy ?? 'system' }))
      this.persist()
    } catch {
      if (revision === this.revision) this.publish(migrated, 'migration')
    }
  }

  private persist() {
    if (!this.writable) return
    try { this.storage().setItem(PREFERENCES_KEY, JSON.stringify(this.snapshot.preferences)) }
    catch { this.publish(this.snapshot.preferences, 'storage') }
  }

  set = (patch: Partial<Omit<ReactUiPreferencesV1, 'version'>>) => {
    const next = parse({ ...this.snapshot.preferences, ...patch, version: 1 })
    this.revision++
    this.publish(next, this.writable ? undefined : 'newer-version')
    this.persist()
  }

  private changed = (event: Event) => {
    const change = event as StorageEvent
    if (change.key !== PREFERENCES_KEY || change.newValue === null) return
    try {
      if (change.storageArea && change.storageArea !== this.storage()) return
      this.revision++
      this.readSaved(change.newValue)
    } catch { this.publish(this.snapshot.preferences, 'invalid') }
  }

  subscribe = (listener: () => void) => {
    if (this.listeners.size === 0) {
      this.events.addEventListener('storage', this.changed)
      if (this.initialization) {
        try {
          const saved = this.storage().getItem(PREFERENCES_KEY)
          if (saved !== null) { this.revision++; this.readSaved(saved) }
        } catch { this.publish(this.snapshot.preferences, 'storage') }
      }
    }
    this.listeners.add(listener)
    void this.initialize()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.events.removeEventListener('storage', this.changed)
    }
  }
}
