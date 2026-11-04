import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AUTHORITY_DEV, UserState } from '@xmcl/runtime-api'
import { readLocalProfileTexture } from './utils/localProfileTexture'

vi.mock('~/app', () => ({ LauncherApp: class {}, Inject: () => () => undefined, LauncherAppKey: Symbol(), kGameDataPath: Symbol() }))
const { UserService } = await import('./UserService')
const directories: string[] = []
const png = () => readFile(join(process.cwd(), 'xmcl-keystone-ui/src/assets/steve_skin.png'))
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-appearance-')); directories.push(root)
  const source = join(root, 'skin.png'); await writeFile(source, await png())
  const state = new UserState() as UserState & { subscribeAll(): void }
  state.subscribeAll = vi.fn()
  state.users.OFFLINE = { id: 'OFFLINE', username: 'OFFLINE', authority: AUTHORITY_DEV, invalidated: false, expiredAt: 1, selectedProfile: 'stable-uuid', profiles: {
    'stable-uuid': { id: 'stable-uuid', name: 'KeepIdentity', textures: { SKIN: { url: '' }, CAPE: { url: 'existing-cape' } } },
    other: { id: 'other', name: 'OtherProfile', textures: { SKIN: { url: '' } } },
  } }
  const images: Buffer[] = [], store = { addImage: vi.fn(async (bytes: Buffer) => { images.push(Buffer.from(bytes)); return 'http://launcher/image/0123456789012345678901234567890123456789' }) }
  const app = { appDataPath: root, minecraftDataPath: root, getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }), controller: { broadcast: vi.fn() }, registry: { get: vi.fn(async () => store) }, registryDisposer: vi.fn(), mutex: { of: () => ({ acquire: async () => () => undefined }) } } as any
  const service = new UserService(app, { registerStatic: () => state } as any)
  const options = { userId: 'OFFLINE', gameProfileId: 'stable-uuid', skin: { url: pathToFileURL(source).href, slim: true } }
  return { root, source, state, store, images, service, options }
}

test('stores owned PNG bytes, preserves identity, selection and other textures; model/reset use no network', async () => {
  const f = await fixture(), bytes = await png()
  await f.service.setLocalProfileAppearance(f.options)
  expect(f.images).toEqual([bytes])
  await writeFile(f.source, 'changed-original')
  const user = f.state.users.OFFLINE
  expect(user.selectedProfile).toBe('stable-uuid')
  expect(user.profiles['stable-uuid']).toMatchObject({ name: 'KeepIdentity', id: 'stable-uuid', textures: { SKIN: { metadata: { model: 'slim' } }, CAPE: { url: 'existing-cape' } } })
  expect(user.profiles.other.textures.SKIN.url).toBe('')
  await f.service.setLocalProfileAppearance({ ...f.options, skin: { url: user.profiles['stable-uuid'].textures.SKIN.url, slim: false } })
  expect(f.store.addImage).toHaveBeenCalledTimes(1)
  expect(user.profiles['stable-uuid'].textures.SKIN.metadata?.model).toBe('steve')
  await f.service.setLocalProfileAppearance({ ...f.options, skin: null, cape: '' })
  expect(user.profiles['stable-uuid'].textures).toEqual({ SKIN: { url: '' } })
})

test('a later invalid cape leaves the whole profile unchanged', async () => {
  const f = await fixture(), before = structuredClone(f.state.users)
  await expect(f.service.setLocalProfileAppearance({ ...f.options, cape: f.source })).rejects.toThrow('dimensions')
  expect(f.state.users).toEqual(before)
})

test('rejects removal or texture edits during I/O without resurrecting or overwriting the profile', async () => {
  const f = await fixture()
  f.store.addImage.mockImplementationOnce(async () => { delete f.state.users.OFFLINE.profiles['stable-uuid']; return 'unused' })
  await expect(f.service.setLocalProfileAppearance(f.options)).rejects.toThrow('profile changed')
  expect(Object.keys(f.state.users.OFFLINE.profiles)).toEqual(['other'])
  f.options.gameProfileId = 'other'
  f.store.addImage.mockImplementationOnce(async () => { f.state.users.OFFLINE.profiles.other.textures.SKIN.url = 'changed-by-other-window'; return 'unused' })
  await expect(f.service.setLocalProfileAppearance(f.options)).rejects.toThrow('profile changed')
  expect(f.state.users.OFFLINE.profiles.other.textures.SKIN.url).toBe('changed-by-other-window')
})

test('uses current native authority and rejects absent and prototype identities', async () => {
  const f = await fixture()
  for (const [userId, gameProfileId] of [['__proto__', 'stable-uuid'], ['OFFLINE', '__proto__'], ['missing', 'missing']]) await expect(f.service.setLocalProfileAppearance({ ...f.options, userId, gameProfileId })).rejects.toThrow('Local profile not found')
  f.state.users.OFFLINE.authority = 'x://microsoft'
  await expect(f.service.setLocalProfileAppearance(f.options)).rejects.toThrow('Local profile not found')
  expect(f.store.addImage).not.toHaveBeenCalled()
})

test('validates model and rejects new remote URLs without fetching them', async () => {
  const f = await fixture()
  await expect(f.service.setLocalProfileAppearance({ ...f.options, skin: { url: f.source, slim: 'yes' as any } })).rejects.toThrow('model')
  for (const url of ['https://example.com/skin.png', 'http://127.0.0.1/private', 'skin.png', '\\\\server\\share\\skin.png']) await expect(f.service.setLocalProfileAppearance({ ...f.options, skin: { url, slim: false } })).rejects.toThrow('local PNG')
})

test('bounded PNG validation accepts real skin, rejects disguised bytes, wrong dimensions, large files and directories', async () => {
  const f = await fixture()
  expect(await readLocalProfileTexture(f.source, 'skin')).toEqual(await png())
  const invalid = join(f.root, 'invalid.png')
  for (const bytes of [Buffer.from('<svg/>'), Buffer.alloc(1024 * 1024 + 1)]) {
    await writeFile(invalid, bytes)
    await expect(readLocalProfileTexture(invalid, 'skin')).rejects.toThrow()
  }
  const wrong = Buffer.from(await png()); wrong.writeUInt32BE(8192, 16); await writeFile(invalid, wrong)
  await expect(readLocalProfileTexture(invalid, 'skin')).rejects.toThrow('dimensions')
  await expect(readLocalProfileTexture(f.root, 'skin')).rejects.toThrow()
})
