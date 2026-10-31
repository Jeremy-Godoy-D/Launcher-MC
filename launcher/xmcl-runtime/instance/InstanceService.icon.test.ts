import { Instance } from '@xmcl/instance'
import { InstanceState } from '@xmcl/runtime-api'
import { createHash } from 'node:crypto'
import { toMediaIconUrl } from './instanceIcon'
import { ensureDir, link, mkdtemp, pathExists, readFile, readJson, rm, stat, writeFile } from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('~/app', () => ({
  Inject: () => () => { },
  LauncherAppKey: Symbol('LauncherAppKey'),
  PathResolver: class { },
  kGameDataPath: Symbol('kGameDataPath'),
}))

vi.mock('~/infra', () => ({
  ImageStorage: class { },
  Tasks: class { },
  kTasks: Symbol('kTasks'),
}))

vi.mock('~/install', () => ({
  VersionMetadataService: class { },
}))

const { InstanceService } = await import('./InstanceService')
const iconName = (bytes: Buffer, ext: string) => `icon-${createHash('sha256').update(bytes).digest('hex')}.${ext}`

function createInstance(path: string): Instance {
  return {
    name: 'Test',
    author: '',
    description: '',
    version: '',
    edition: 'java',
    runtime: {
      minecraft: '1.20.1',
      forge: '',
      fabricLoader: '',
      optifine: '',
      quiltLoader: '',
      neoForged: '',
      labyMod: '',
    },
    icon: '',
    url: '',
    fileApi: '',
    playtime: 0,
    lastPlayedDate: 0,
    creationDate: Date.now(),
    lastAccessDate: Date.now(),
    path,
  }
}

describe('InstanceService icon storage', () => {
  const animatedGif = Buffer.from(
    'R0lGODlhEAAQAIEAACR0zAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAEyAAEALAAAAAAQABAAgeaiPAAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw==',
    'base64',
  )
  let appDataPath: string
  let instancePath: string

  beforeEach(async () => {
    appDataPath = await mkdtemp(join(tmpdir(), 'xmcl-instance-icon-'))
    instancePath = join(appDataPath, 'instances', 'test')
    await ensureDir(instancePath)
  })


  afterEach(async () => {
    await rm(appDataPath, { recursive: true, force: true })
  })

  function createService(state: InstanceState, fetch = vi.fn()) {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = {
      appDataPath,
      minecraftDataPath: appDataPath,
      getLogger: () => logger,
      controller: { broadcast: vi.fn() },
      mutex: { of: vi.fn() },
      fetch,
    }
    const store = { registerStatic: () => state }
    return new InstanceService(
      app as any,
      store as any,
      {} as any,
      (...paths: string[]) => join(appDataPath, ...paths),
      {} as any,
      {} as any,
    )
  }

  test('copies a shared launcher image into the instance folder when setting the icon', async () => {
    const imageHash = '0123456789abcdef0123456789abcdef01234567'
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    await ensureDir(join(appDataPath, 'resource-images'))
    await writeFile(join(appDataPath, 'resource-images', imageHash), png)

    const state = new InstanceState() as InstanceState & { subscribe: ReturnType<typeof vi.fn> }
    state.subscribe = vi.fn()
    state.instanceAdd(createInstance(instancePath))
    const service = createService(state)

    await service.editInstance({
      instancePath,
      icon: `http://launcher/image/${imageHash}`,
    })

    expect(state.all[instancePath].icon).toBe(toMediaIconUrl(join(instancePath, iconName(png, 'png'))))
    expect(await pathExists(join(instancePath, iconName(png, 'png')))).toBe(true)
  })

  test('downloads a remote image into the instance folder when setting the icon URL', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const state = new InstanceState() as InstanceState & { subscribe: ReturnType<typeof vi.fn> }
    state.subscribe = vi.fn()
    state.instanceAdd(createInstance(instancePath))
    const fetch = vi.fn().mockResolvedValue(new Response(png, {
      headers: { 'content-type': 'image/png' },
    }))
    const service = createService(state, fetch)

    await service.editInstance({
      instancePath,
      icon: 'https://example.com/icon.png',
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/icon.png')
    expect(state.all[instancePath].icon).toBe(toMediaIconUrl(join(instancePath, iconName(png, 'png'))))
    expect(await pathExists(join(instancePath, iconName(png, 'png')))).toBe(true)
  })

  test('keeps a local GIF icon animated', async () => {
    const sourcePath = join(appDataPath, 'animated.gif')
    await writeFile(sourcePath, animatedGif)

    const state = new InstanceState() as InstanceState & { subscribe: ReturnType<typeof vi.fn> }
    state.subscribe = vi.fn()
    state.instanceAdd(createInstance(instancePath))
    const service = createService(state)

    await service.editInstance({
      instancePath,
      icon: `http://launcher/media?path=${sourcePath}`,
    })

    expect(state.all[instancePath].icon).toBe(toMediaIconUrl(join(instancePath, iconName(animatedGif, 'gif'))))
    expect(await pathExists(join(instancePath, iconName(animatedGif, 'gif')))).toBe(true)
    expect(await readFile(join(instancePath, iconName(animatedGif, 'gif')))).toEqual(animatedGif)
  })

  test('an imported icon owns independent bytes and changing its source cannot change the saved icon', async () => {
    const source = join(appDataPath, 'source.gif')
    await writeFile(source, animatedGif)
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await createService(state).editInstance({ instancePath, icon: `http://launcher/media?path=${source}` })
    const stored = decodeURIComponent(state.all[instancePath].icon.split('?path=')[1])
    expect((await stat(source)).nlink).toBe(1)
    await writeFile(source, 'changed-source')
    expect(await readFile(stored)).toEqual(animatedGif)
  })

  test('replacing a legacy hard-linked icon never overwrites its original', async () => {
    const source = join(appDataPath, 'legacy.gif'), original = Buffer.from(animatedGif)
    original[13] ^= 0xff
    await writeFile(source, original); await link(source, join(instancePath, 'icon.gif'))
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await createService(state, vi.fn(async () => new Response(animatedGif))).editInstance({ instancePath, icon: 'https://example.com/replacement.gif' })
    expect(await readFile(source)).toEqual(original)
  })

  test('a disguised local file is rejected without changing the instance metadata', async () => {
    const source = join(appDataPath, 'invalid.png'); await writeFile(source, '<html>not an image</html>')
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await expect(createService(state).editInstance({ instancePath, icon: `http://launcher/media?path=${source}` })).rejects.toThrow()
    expect(state.all[instancePath].icon).toBe('')
  })

  test('local icons exceeding 8MiB are rejected before writing owned image data', async () => {
    const source = join(appDataPath, 'too-large.png'); await writeFile(source, Buffer.alloc(8 * 1024 * 1024 + 1))
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await expect(createService(state).editInstance({ instancePath, icon: `http://launcher/media?path=${source}` })).rejects.toThrow('size limit')
    expect(state.all[instancePath].icon).toBe('')
  })

  test('new relative icon references cannot escape the instance folder', async () => {
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await expect(createService(state).editInstance({ instancePath, icon: '../outside.png' })).rejects.toThrow('escapes')
    expect(state.all[instancePath].icon).toBe('')
  })

  test('remote bodies without a trustworthy length are stopped at the byte limit', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) }, cancel() { cancelled = true } })
    const state = new InstanceState() as any; state.subscribe = vi.fn(); state.instanceAdd(createInstance(instancePath))
    await expect(createService(state, vi.fn(async () => new Response(body))).editInstance({ instancePath, icon: 'https://example.com/unbounded.png' })).rejects.toThrow('maximum size')
    expect(cancelled).toBe(true); expect(state.all[instancePath].icon).toBe('')
  })

  test('stores a remote GIF with its original format', async () => {
    const state = new InstanceState() as InstanceState & { subscribe: ReturnType<typeof vi.fn> }
    state.subscribe = vi.fn()
    state.instanceAdd(createInstance(instancePath))
    const fetch = vi.fn().mockResolvedValue(new Response(animatedGif, {
      headers: { 'content-type': 'image/gif' },
    }))
    const service = createService(state, fetch)

    await service.editInstance({
      instancePath,
      icon: 'https://example.com/icon.gif',
    })

    expect(state.all[instancePath].icon).toBe(toMediaIconUrl(join(instancePath, iconName(animatedGif, 'gif'))))
    expect(await pathExists(join(instancePath, iconName(animatedGif, 'gif')))).toBe(true)
    expect(await readFile(join(instancePath, iconName(animatedGif, 'gif')))).toEqual(animatedGif)
  })

  test('persists an animated remote thumbnail when creating a modpack instance', async () => {
    const state = new InstanceState() as InstanceState & { subscribe: ReturnType<typeof vi.fn> }
    state.subscribe = vi.fn()
    const icon = 'https://media.forgecdn.net/avatars/thumbnails/1735/273/256/256/icon_animated.gif'
    const fetch = vi.fn().mockResolvedValue(new Response(animatedGif, {
      headers: { 'content-type': 'image/gif', 'content-length': String(animatedGif.byteLength) },
    }))
    const service = createService(state, fetch)

    const path = await service.createInstance({
      name: 'GIF modpack',
      runtime: { minecraft: '1.20.1' },
      icon,
      upstream: { type: 'curseforge-modpack', modId: 385053, fileId: 8813051 },
    })

    expect(fetch).toHaveBeenCalledExactlyOnceWith(icon)
    expect(state.all[path].icon).toBe(toMediaIconUrl(join(path, iconName(animatedGif, 'gif'))))
    expect((await readJson(join(path, 'instance.json'))).icon).toBe(iconName(animatedGif, 'gif'))
    expect(await readFile(join(path, iconName(animatedGif, 'gif')))).toEqual(animatedGif)
  })
})
