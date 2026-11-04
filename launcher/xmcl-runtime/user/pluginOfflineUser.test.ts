import { expect, test, vi } from 'vitest'
import { AUTHORITY_DEV, UserState, normalizeUserId } from '@xmcl/runtime-api'
import { pluginOffineUser } from './pluginOfflineUser'
import { UserService } from './UserService'
import { kUserTokenStorage } from './userTokenStore'
import type { UserAccountSystem } from './accountSystems/AccountSystem'
import { getUUID } from './utils/offlineUser'

vi.mock('~/app', () => ({ LauncherApp: class {}, Inject: () => () => undefined, LauncherAppKey: Symbol(), kGameDataPath: Symbol() }))

test('local login uses the same account ID as persistence and keeps existing UUIDs, textures and profiles', async () => {
  const id = normalizeUserId('OFFLINE', AUTHORITY_DEV), state = new UserState()
  state.users[id] = { id, username: 'OFFLINE', authority: AUTHORITY_DEV, expiredAt: 1, invalidated: false, selectedProfile: 'legacy-world-uuid', profiles: {
    'legacy-world-uuid': { id: 'legacy-world-uuid', name: 'ExistingQA', textures: { SKIN: { url: 'kept-texture' } } },
    [getUUID('RepeatQA')]: { id: getUUID('RepeatQA'), name: 'RepeatQA', textures: { SKIN: { url: 'repeat-texture', metadata: { model: 'slim' } } } },
  } }
  const before = structuredClone(state.users), initialize = vi.fn(async () => {}), put = vi.fn(async () => {})
  let system: UserAccountSystem | undefined
  const userService = { state, initialize, registerAccountSystem: (_: string, value: UserAccountSystem) => { system = value } }
  const app = { registry: { get: async (key: unknown) => key === UserService ? userService : key === kUserTokenStorage ? { put } : {} } }
  await pluginOffineUser(app as any, {} as any)
  expect(state.users).toEqual(before)
  const next = await system!.login({ username: 'NewProfileQA', authority: AUTHORITY_DEV }, new AbortController().signal)
  expect(initialize).toHaveBeenCalledTimes(1)
  expect(next.id).toBe(id); expect(next.username).toBe('OFFLINE')
  expect(next.profiles['legacy-world-uuid']).toEqual(before[id].profiles['legacy-world-uuid'])
  expect(next.selectedProfile).toBe(getUUID('NewProfileQA'))
  expect(Object.keys(next.profiles)).toHaveLength(3)
  state.userProfile(next)
  const repeated = await system!.login({ username: 'RepeatQA', authority: AUTHORITY_DEV }, new AbortController().signal)
  expect(repeated.profiles[getUUID('RepeatQA')].textures.SKIN.url).toBe('repeat-texture')
  expect(state.users[id].profiles['legacy-world-uuid'].id).toBe('legacy-world-uuid')
  expect(put).toHaveBeenCalledTimes(2)
})
