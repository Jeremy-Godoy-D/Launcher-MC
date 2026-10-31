import { describe, expect, it, vi } from 'vitest'
import { PREFERENCES_KEY, PreferencesStore } from './preferences'

function fixture(readLegacy = vi.fn(async (): Promise<unknown> => undefined)) {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
  const events = new EventTarget()
  return { values, storage, events, readLegacy, store: new PreferencesStore(() => storage, events, readLegacy) }
}
function change(events: EventTarget, value: string) {
  events.dispatchEvent(Object.assign(new Event('storage'), { key: PREFERENCES_KEY, newValue: value }))
}

describe('React UI preferences', () => {
  it('migrates backend appearance and device performance once, leaving all legacy data untouched', async () => {
    const f = fixture(vi.fn(async () => false))
    f.values.set('aurora.performanceMode', 'true')
    f.values.set('themes', '{"customCss":"do not execute"}')
    await f.store.initialize()
    expect(f.store.getSnapshot().preferences).toMatchObject({ appearance: 'light', performanceMode: true, backgroundVideoEnabled: true })
    const again = new PreferencesStore(() => f.storage, f.events, f.readLegacy)
    await again.initialize()
    expect(again.getSnapshot()).toEqual(f.store.getSnapshot())
    expect(f.readLegacy).toHaveBeenCalledTimes(1)
    expect(f.values.get('themes')).toContain('do not execute')
    expect(f.values.get('aurora.performanceMode')).toBe('true')
  })

  it('preserves a legacy system choice without consulting the removed theme engine', async () => {
    const f = fixture()
    f.values.set('darkTheme', 'system')
    await f.store.initialize()
    expect(f.store.getSnapshot().preferences.appearance).toBe('system')
    expect(f.readLegacy).not.toHaveBeenCalled()
  })

  it('does not overwrite a user change with a delayed migration', async () => {
    let resolve!: (value: unknown) => void
    const f = fixture(vi.fn(() => new Promise(done => { resolve = done })))
    const loading = f.store.initialize()
    f.store.set({ appearance: 'dark', libraryView: 'list' })
    resolve(false)
    await loading
    expect(f.store.getSnapshot().preferences).toMatchObject({ appearance: 'dark', libraryView: 'list' })
  })

  it('synchronizes other windows without echo writes and removes its listener', async () => {
    const f = fixture()
    const notify = vi.fn()
    const stop = f.store.subscribe(notify)
    await f.store.initialize()
    const initial = f.store.getSnapshot()
    f.storage.setItem.mockClear()
    change(f.events, JSON.stringify({ ...initial.preferences, appearance: 'light' }))
    expect(f.store.getSnapshot().preferences.appearance).toBe('light')
    expect(initial.preferences.appearance).toBe('system')
    expect(f.storage.setItem).not.toHaveBeenCalled()
    stop(); stop()
    notify.mockClear()
    change(f.events, JSON.stringify(initial.preferences))
    expect(notify).not.toHaveBeenCalled()
  })

  it('keeps malformed and newer records intact, while allowing session changes', async () => {
    for (const value of ['{bad', '{"version":2,"unknown":"keep"}']) {
      const f = fixture()
      f.values.set(PREFERENCES_KEY, value)
      await f.store.initialize()
      expect(f.store.getSnapshot().error).toBe(value.startsWith('{bad') ? 'invalid' : 'newer-version')
      expect(f.storage.setItem).not.toHaveBeenCalled()
      if (!value.startsWith('{bad')) {
        f.store.set({ performanceMode: true })
        expect(f.values.get(PREFERENCES_KEY)).toBe(value)
      }
    }
  })

  it('reads changes made by another window while all local consumers were unmounted', async () => {
    const f = fixture()
    const stop = f.store.subscribe(() => {})
    await f.store.initialize()
    stop()
    f.values.set(PREFERENCES_KEY, JSON.stringify({ ...f.store.getSnapshot().preferences, libraryView: 'list' }))
    const again = f.store.subscribe(() => {})
    expect(f.store.getSnapshot().preferences.libraryView).toBe('list')
    again()
  })

  it('recovers from denied/quota storage and a failed migration without blocking session settings', async () => {
    const events = new EventTarget()
    const store = new PreferencesStore(() => { throw new Error('Denied') }, events)
    await store.initialize()
    store.set({ performanceMode: true })
    expect(store.getSnapshot()).toMatchObject({ preferences: { performanceMode: true }, error: 'storage' })
    const f = fixture(vi.fn(async () => { throw new Error('Offline') }))
    await f.store.initialize()
    expect(f.values.has(PREFERENCES_KEY)).toBe(false)
    expect(f.store.getSnapshot().error).toBe('migration')
  })
})
