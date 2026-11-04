import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {} }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
const { InstanceOptionsService } = await import('./InstanceOptionsService')
const { InstanceService } = await import('./InstanceService'), { LaunchService } = await import('../launch/LaunchService')
let root: string, path: string, instances: any[], processes: any[], service: InstanceType<typeof InstanceOptionsService>
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-legacy-shader-')); path = join(root, 'instance'); await mkdir(join(path, 'config'), { recursive: true })
  instances = [{ path, edition: 'java' }]; processes = []; const locks = new Map<string, Mutex>()
  const app = { mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    throw new Error('Unexpected registry access')
  } } }; service = new InstanceOptionsService(app as any, name => join(root, name))
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('legacy readers and writers round-trip Unicode, escaped spaces and equals while preserving unknown properties and comments', async () => {
  for (const name of ['iris', 'oculus']) await writeFile(join(path, `config/${name}.properties`), '# keep\r\ncustom=value=equal\r\n')
  const shaderPack = 'Áurea = Luna.zip'
  await service.editIrisShaderOptions({ instancePath: path, shaderPack }); await service.editOculusShaderOptions({ instancePath: path, shaderPack })
  expect(await service.getIrisShaderOptions(path)).toMatchObject({ shaderPack, enableShaders: 'true', custom: 'value=equal' })
  expect(await service.getOculusShaderOptions(path)).toMatchObject({ shaderPack, enableShaders: 'true', custom: 'value=equal' })
  expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toContain('# keep\r\ncustom=value=equal\r\n')
  await service.editShaderOptions({ instancePath: path, shaderPack, antialiasingLevel: '4' })
  expect(await service.getShaderOptions(path)).toMatchObject({ shaderPack, antialiasingLevel: '4' })
})
it('rejects unregistered and non-Java configuration reads and writes', async () => {
  for (const edition of ['missing', 'bedrock']) {
    instances = edition === 'missing' ? [] : [{ path, edition }]
    for (const call of [() => service.getIrisShaderOptions(path), () => service.getShaderOptions(path), () => service.editShaderOptions({ instancePath: path, shaderPack: '' }), () => service.editIrisShaderOptions({ instancePath: path, shaderPack: '' })]) await expect(call()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  }
})
it('blocks all legacy shader writes while the tracked instance is running', async () => {
  processes = [{ options: { gameDirectory: path } }]
  for (const call of [() => service.editShaderOptions({ instancePath: path, shaderPack: '' }), () => service.editIrisShaderOptions({ instancePath: path, shaderPack: '' }), () => service.editOculusShaderOptions({ instancePath: path, shaderPack: '' })]) await expect(call()).rejects.toHaveProperty('name', 'InstanceRunningError')
  expect(await service.getShaderOptions(path)).toMatchObject({ shaderPack: '' })
})
it('does not break a shared config inode or accept a traversal filename', async () => {
  await writeFile(join(path, 'config/iris.properties'), 'shaderPack=KEEP\n'); await link(join(path, 'config/iris.properties'), join(root, 'shared'))
  await expect(service.editIrisShaderOptions({ instancePath: path, shaderPack: 'new.zip' })).rejects.toThrow('Shared shader configuration')
  expect(await readFile(join(root, 'shared'), 'utf8')).toBe('shaderPack=KEEP\n')
  await expect(service.editOculusShaderOptions({ instancePath: path, shaderPack: '../outside' })).rejects.toThrow()
})
