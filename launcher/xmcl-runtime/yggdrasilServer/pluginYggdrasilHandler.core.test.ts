import { expect, it, vi } from 'vitest'
import { AUTHORITY_DEV } from '@xmcl/runtime-api'

vi.mock('~/user', () => ({ UserService: class UserService {} }))
const { UserService } = await import('~/user')
const { pluginYggdrasilHandler } = await import('./pluginYggdrasilHandler')
it('serves a local game profile without a peer service or network lookup', async () => {
  const profile = { id: 'a'.repeat(32), name: 'OwnedLocal', textures: {} }
  const get = vi.fn(async key => { if (key !== UserService) throw new Error('Unexpected service'); return { state: { users: { local: { authority: AUTHORITY_DEV, profiles: { [profile.id]: profile } } } } } })
  const registerHandler = vi.fn(), app = { registry: { get }, protocol: { registerHandler }, getLogger: () => ({ log: vi.fn() }), serverPort: Promise.resolve(25555) }
  pluginYggdrasilHandler(app as any, {} as any)
  const response: Record<string, any> = { headers: {} }
  await registerHandler.mock.calls[0][1]({ request: { method: 'GET', url: new URL(`xmcl://launcher/yggdrasil/sessionserver/session/minecraft/profile/${profile.id}`) }, response })
  expect(response.status).toBe(200); expect(JSON.parse(response.body)).toMatchObject({ id: profile.id, name: profile.name })
  expect(get).toHaveBeenCalledTimes(1)
})
