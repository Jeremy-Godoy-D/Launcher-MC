import { describe, expect, it } from 'vitest'
import { profileEntries, selectedAccount, validLocalName, type Account } from './model'
import { StoredSelection } from './selection'

const local: Account = {
  id: 'OFFLINE',
  authority: 'x://dev',
  username: 'OFFLINE',
  selectedProfile: 'a',
  profiles: { a: { id: 'a', name: 'PlayerOne', textures: { SKIN: { url: '' } } } },
  invalidated: false,
  expiredAt: 0,
}
const external = { ...local, id: 'external', authority: 'x://microsoft' }
describe('local accounts', () => {
  it('uses the same name validation in renderer and runtime', () => {
    for (const name of ['Player_1', 'abc', '1234567890123456'])
      expect(validLocalName(name)).toBe(true)
    for (const name of [
      '',
      'aa',
      '12345678901234567',
      'Player One',
      '<script>',
      'José',
      'a\nabc',
      'abc\n',
      'abc\r',
    ])
      expect(validLocalName(name)).toBe(false)
  })
  it('preserves an existing external selection and never replaces a missing saved identity', () => {
    expect(selectedAccount([local, external], 'external')).toBe(external)
    expect(selectedAccount([local, external], 'missing')).toBeUndefined()
    expect(selectedAccount([external, local], '')).toBe(local)
    expect(profileEntries([local])[0]).toMatchObject({ id: 'a', name: 'PlayerOne' })
  })
  it('shares selection, preserves the legacy key format and refreshes after an unmounted window interval', () => {
    const values = new Map([['selectedUserId', 'external']])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    const events = new EventTarget()
    const store = new StoredSelection('selectedUserId', () => storage, events)
    expect(store.getSnapshot()).toBe('external')
    const stop = store.subscribe(() => {})
    store.set('OFFLINE')
    expect(values.get('selectedUserId')).toBe('OFFLINE')
    values.set('selectedUserId', 'external')
    events.dispatchEvent(Object.assign(new Event('storage'), { key: 'selectedUserId' }))
    expect(store.getSnapshot()).toBe('external')
    stop()
    values.set('selectedUserId', 'OFFLINE')
    store.subscribe(() => {})()
    expect(store.getSnapshot()).toBe('OFFLINE')
    const denied = new StoredSelection(
      'selectedUserId',
      () => {
        throw new Error('Denied')
      },
      events,
    )
    denied.set('OFFLINE')
    expect(denied.getSnapshot()).toBe('OFFLINE')
    expect(denied.failed()).toBe(true)
  })
})
