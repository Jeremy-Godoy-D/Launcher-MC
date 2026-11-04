import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('~/app', () => ({ LauncherApp: class {}, Inject: () => () => undefined, LauncherAppKey: Symbol(), kGameDataPath: Symbol() }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
const { PresentationService } = await import('./PresentationService')
const directories: string[] = []
const source = 'https://cdn.modrinth.com/data/abcdefgh/images/featured.png'
const png = await readFile(join(process.cwd(), 'xmcl-keystone-ui/src/assets/steve_skin.png'))
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(upstream: object | undefined, project: object) {
  const root = await mkdtemp(join(tmpdir(), 'grimo-presentation-')); directories.push(root)
  const fetch = vi.fn(async (input: any, init?: RequestInit) => String(input).includes('images/')
    ? new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }) : Response.json(project))
  const instance = { path: join(root, 'instance'), name: 'Editable name', edition: 'java', upstream }
  const instances = { initialize: vi.fn(), state: { all: { [instance.path]: instance } } }
  const service = new PresentationService({ appDataPath: root, fetch, getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) } as any, instances as any)
  return { root, fetch, instance, instances, service }
}

test('uses the upstream ID and featured gallery ahead of other images, never the editable name or account', async () => {
  const { fetch, service, instance } = await fixture({ type: 'modrinth-modpack', projectId: 'abcdefgh' }, {
    id: 'abcdefgh', project_type: 'modpack', gallery: [{ featured: false, url: `${source}/other` }, { featured: true, url: `${source}/thumbnail`, raw_url: source }],
  })
  const result = await service.resolveInstanceMedia(instance.path)
  expect(result).toMatchObject({ provider: 'modrinth', sourceUrl: source, projectUrl: 'https://modrinth.com/modpack/abcdefgh' })
  expect(String(fetch.mock.calls[0][0])).toBe('https://api.modrinth.com/v2/project/abcdefgh')
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
  expect(new Headers(fetch.mock.calls[0][1]?.headers).has('authorization')).toBe(false)
  instance.name = 'A different title'
  expect(await service.resolveInstanceMedia(instance.path)).toEqual(result)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('CurseForge metadata goes only to the proxy and screenshots belong to the exact Minecraft modpack', async () => {
  vi.stubEnv('CURSEFORGE_PROXY_URL', 'https://proxy.example.workers.dev')
  const { service, instance, fetch } = await fixture({ type: 'curseforge-modpack', modId: 123 }, {
    data: { id: 123, gameId: 432, classId: 4471, screenshots: [{ modId: 456, url: `${source}/wrong` }, { modId: 123, url: source }] },
  })
  expect(await service.resolveInstanceMedia(instance.path)).toMatchObject({ provider: 'curseforge', sourceUrl: source })
  expect(String(fetch.mock.calls[0][0])).toBe('https://proxy.example.workers.dev/v1/mods/123')
  const headers = new Headers(fetch.mock.calls[0][1]?.headers)
  for (const name of ['x-api-key', 'authorization', 'cookie']) expect(headers.has(name)).toBe(false)
})

test.each([undefined, { type: 'server', url: 'https://evil.test' }, { type: 'modrinth-modpack', projectId: '../private' }, { type: 'curseforge-modpack', modId: -1 }])('Vanilla and unsupported IDs make no requests (%j)', async upstream => {
  const { service, instance, fetch } = await fixture(upstream, {})
  expect(await service.resolveInstanceMedia(instance.path)).toBeUndefined()
  expect(await service.resolveInstanceMedia('missing')).toBeUndefined()
  expect(fetch).not.toHaveBeenCalled()
})

test('missing proxy configuration fails closed and malformed/wrong metadata falls back', async () => {
  vi.stubEnv('CURSEFORGE_PROXY_URL', '')
  const cf = await fixture({ type: 'curseforge-modpack', modId: 123 }, {})
  expect(await cf.service.resolveInstanceMedia(cf.instance.path)).toBeUndefined()
  expect(cf.fetch).not.toHaveBeenCalled()
  const mr = await fixture({ type: 'modrinth-modpack', projectId: 'abcdefgh' }, { id: 'different', project_type: 'modpack', gallery: [{ url: source }] })
  expect(await mr.service.resolveInstanceMedia(mr.instance.path)).toBeUndefined()
  expect(mr.fetch).toHaveBeenCalledTimes(1)
})
