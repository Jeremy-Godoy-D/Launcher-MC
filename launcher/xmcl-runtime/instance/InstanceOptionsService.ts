import { type Frame, parse } from '@xmcl/gamesetting'
import {
  type EditGameSettingOptions,
  type EditShaderOptions,
  GameOptionsState,
  getInstanceGameOptionKey,
  type InstanceOptionsService as IInstanceOptionsService,
  InstanceOptionsServiceKey,
  LockKey,
  type ResourcePackSelection,
} from '@xmcl/runtime-api'
import { FSWatcher } from 'chokidar'
import { ensureDir, ensureFile, readdir, readFile, unlink, writeFile } from 'fs-extra'
import { basename, dirname, join, resolve, sep } from 'path'
import { Inject, kGameDataPath, LauncherAppKey, type PathResolver } from '~/app'
import { AbstractService, ExposeServiceKey, ServiceStateManager } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { AnyError, isSystemError } from '@xmcl/utils'
import {
  handleOnlyNotFound,
  hardLinkFiles,
  isHardLinked,
  missing,
  unHardLinkFiles,
} from '../util/fs'

import { requireString } from '../util/object'
import { existsSync } from 'fs'
import { InstanceService } from './InstanceService'
import { LaunchService } from '../launch/LaunchService'
import { readResourcePackSelection, writeResourcePackSelection } from './utils/resourcePackSelection'
import { readShaderProperties, writeShaderProperties } from './utils/shaderProperties'
import type { ShaderEngine } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { importPathParts } from '../util/importFile'

/**
 * Top-level files under `<instance>/server/` that the agent / UI may read &
 * write directly. Restricted to a fixed allowlist so callers cannot read or
 * overwrite arbitrary paths.
 */
const SERVER_FILES = new Set([
  'server.properties',
  'eula.txt',
  'ops.json',
  'whitelist.json',
  'banned-ips.json',
  'banned-players.json',
  'usercache.json',
])

/**
 * The service to watch game setting (options.txt) and shader options (optionsshader.txt)
 */
@ExposeServiceKey(InstanceOptionsServiceKey)
export class InstanceOptionsService extends AbstractService implements IInstanceOptionsService {
  constructor(
    @Inject(LauncherAppKey) app: LauncherApp,
    @Inject(kGameDataPath) private getPath: PathResolver,
  ) {
    super(app)
  }

  async #javaInstance(path: string) {
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    if (!instances.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
  }

  async getResourcePackSelection(path: string) {
    await this.#javaInstance(path)
    return readResourcePackSelection(path)
  }

  async editResourcePackSelection(path: string, selection: ResourcePackSelection) {
    await this.#javaInstance(path)
    return this.mutex.of('resource-pack-options').runExclusive(() => this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#javaInstance(path)
      const launch = await this.app.registry.get(LaunchService)
      const processes = await launch.getGameProcesses()
      if (processes.some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
      if (processes.length && await this.isGameOptionsLinked(path) && (await Promise.all(processes.map(process => this.isGameOptionsLinked(process.options.gameDirectory)))).some(Boolean)) throw new AnyError('SharedOptionsRunningError')
      return writeResourcePackSelection(path, selection, this.getPath('resourcepacks'), this.getPath('options.txt'))
    }))
  }

  getServerProperties(instancePath: string): Promise<Record<string, string>> {
    const path = join(instancePath, 'server', 'server.properties')
    const content = readFile(path, 'utf-8').catch(() => '')
    const properties = content.then((content) => {
      const lines = content.split('\n').filter((v) => v.trim().length > 0)
      const mapped = lines.map((l) => l.split('='))
      return mapped.reduce((a, b) => Object.assign(a, { [b[0]]: b[1] }), {})
    })
    return properties
  }

  async setServerProperties(
    instancePath: string,
    properties: Record<string, string | number | boolean>,
  ): Promise<void> {
    const path = join(instancePath, 'server', 'server.properties')
    const original = await this.getServerProperties(instancePath)
    const merged = Object.assign(original, properties)
    const content =
      Object.entries(merged)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n'
    await ensureFile(path)
    await writeFile(path, content)
  }

  /**
   * Resolve a top-level server file to its absolute path, rejecting anything
   * that is not in the {@link SERVER_FILES} allowlist (including subpaths and
   * path traversal).
   */
  #resolveServerFile(instancePath: string, file: string) {
    if (basename(file) !== file || !SERVER_FILES.has(file)) {
      throw new AnyError('ServerFileError', `Invalid or unsupported server file: ${file}`)
    }
    return join(instancePath, 'server', file)
  }

  async getServerFile(instancePath: string, file: string): Promise<string> {
    const target = this.#resolveServerFile(instancePath, file)
    const content = await readFile(target, 'utf-8').catch(handleOnlyNotFound)
    return content ?? ''
  }

  async setServerFile(instancePath: string, file: string, content: string): Promise<void> {
    const target = this.#resolveServerFile(instancePath, file)
    await ensureFile(target)
    await writeFile(target, content)
  }

  /**
   * Resolve a `config/`-relative path to an absolute path, guarding against
   * path traversal (e.g. `../options.txt`). Throws if the resolved path would
   * escape the instance `config` directory.
   */
  #resolveConfigPath(instancePath: string, filePath: string) {
    const configDir = resolve(instancePath, 'config')
    const target = resolve(configDir, filePath)
    if (target !== configDir && !target.startsWith(configDir + sep)) {
      throw new AnyError('ConfigPathError', `Invalid config path: ${filePath}`)
    }
    return target
  }

  async getInstanceConfigFiles(instancePath: string): Promise<string[]> {
    const configDir = join(instancePath, 'config')
    const result: string[] = []
    const walk = async (dir: string, prefix: string) => {
      if (!existsSync(dir)) return
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), rel)
        } else if (entry.isFile()) {
          result.push(rel)
        }
      }
    }
    await walk(configDir, '')
    return result
  }

  async getInstanceConfig(instancePath: string, filePath: string): Promise<string> {
    const target = this.#resolveConfigPath(instancePath, filePath)
    return readFile(target, 'utf-8')
  }

  async setInstanceConfig(instancePath: string, filePath: string, content: string): Promise<void> {
    const target = this.#resolveConfigPath(instancePath, filePath)
    await ensureDir(dirname(target))
    await writeFile(target, content)
  }

  async removeInstanceConfig(instancePath: string, filePath: string): Promise<void> {
    const target = this.#resolveConfigPath(instancePath, filePath)
    await unlink(target)
  }

  async getEULA(instancePath: string): Promise<boolean> {
    const optionsPath = join(instancePath, 'server', 'eula.txt')
    try {
      const content = await readFile(optionsPath, 'utf-8')
      return content.includes('eula=true')
    } catch {
      return false
    }
  }

  async setEULA(instancePath: string, value: boolean): Promise<void> {
    const optionsPath = join(instancePath, 'server', 'eula.txt')
    await ensureFile(optionsPath)
    return writeFile(optionsPath, `eula=${Boolean(value)}`)
  }

  async watch(path: string) {
    requireString(path)
    const stateManager = await this.app.registry.get(ServiceStateManager)
    return stateManager.registerOrGet(
      getInstanceGameOptionKey(path),
      async ({ defineAsyncOperation }) => {
        const state = new GameOptionsState()

        const loadShaderOptions = defineAsyncOperation(async (path: string) => {
          try {
            const result = await this.getShaderOptions(path)
            state.shaderPackSet(result.shaderPack)
          } catch (e) {
            if (isSystemError(e)) {
              this.warn(`An error ocurred during load shader options of ${path}.`)
              this.warn(e)
            }
          }
        })

        const loadOptions = defineAsyncOperation(async (path: string) => {
          try {
            const result = await this.getGameOptions(path)
            state.gameOptionsSet(result)
          } catch (e) {
            if (isSystemError(e)) {
              this.warn(`An error ocurred during parse game options of ${path}.`)
              this.warn(e)
            }
          }
        })

        const loadEula = defineAsyncOperation(async (path: string) => {
          try {
            const result = await this.getEULA(path)
            state.eulaSet(result)
          } catch (e) {
            if (isSystemError(e)) {
              this.warn(`An error ocurred during parse eula of ${path}.`)
              this.warn(e)
            }
          }
        })

        this.log(`Start to watch instance options.txt in ${path}`)

        const watcher = new FSWatcher({
          cwd: path,
          ignorePermissionErrors: true,
        })
        const dispose = () => {
          watcher.close()
        }

        watcher
          .on('all', (event, file) => {
            if (basename(file) === 'options.txt') {
              loadOptions(path)
            } else if (basename(file) === 'optionsshaders.txt') {
              loadShaderOptions(path)
            } else if (basename(file) === 'eula.txt') {
              loadEula(path)
            } else if (event === 'unlinkDir' && !file) {
              dispose()
            }
          })
          .add('options.txt')
          .add('optionsshaders.txt')
          .add(join('server', 'eula.txt'))

        return [state, dispose]
      },
    )
  }

  /**
   * Load `optionsshader.txt` file
   */
  async getShaderOptions(instancePath: string) {
    await this.#javaInstance(instancePath)
    const { values } = await readShaderProperties(instancePath, 'optifine')
    return { ...values, shaderPack: values.shaderPack || '' }
  }

  async isGameOptionsLinked(instancePath: string) {
    const rootGameOptions = this.getPath('options.txt')
    const instanceGameOptions = join(instancePath, 'options.txt')

    const isLinked = await isHardLinked(rootGameOptions, instanceGameOptions)

    return isLinked
  }

  async linkGameOptions(instancePath: string) {
    const rootGameOptions = this.getPath('options.txt')
    const instanceGameOptions = join(instancePath, 'options.txt')

    await hardLinkFiles(rootGameOptions, instanceGameOptions)
  }

  async unlinkGameOptions(instancePath: string) {
    const rootGameOptions = this.getPath('options.txt')
    const instanceGameOptions = join(instancePath, 'options.txt')

    await unHardLinkFiles(rootGameOptions, instanceGameOptions)
  }

  async getGameOptions(instancePath: string) {
    const optionsPath = join(instancePath, 'options.txt')
    const result = await readFile(optionsPath, 'utf-8').then(parse, async (e) => {
      if (isSystemError(e) && e.code === 'ENOENT') {
        if (
          !existsSync(join(instancePath, 'config', 'yosby', 'options.txt')) &&
          !existsSync(join(instancePath, 'config', 'yosbr', 'options.txt')) &&
          !existsSync(join(instancePath, 'config', 'defaultoptions'))
        ) {
          await writeFile(optionsPath, `lang:${this.app.host.getLocale().replace('-', '_')}\n`)
        }
      }
      return {} as Frame
    })

    if (typeof result.resourcePacks === 'string') {
      const raw = result.resourcePacks
      try {
        result.resourcePacks = JSON.parse(raw)
      } catch (e) {
        // options.txt's `resourcePacks:` line stores a JSON array on a
        // single line. We've observed truncated values in telemetry
        // (issue #1469 — partial writes by other launchers / crashes
        // mid-save: `[`, `["`, `["vanilla","fabric","file/Foo.zip"`).
        // Salvage what we can with a lenient regex, then silently fall
        // back to `[]`. The previous explicit telemetry probe was kept
        // only until we could see the pattern — we now have plenty of
        // samples; sending it as an exception every time pollutes
        // App Insights for no operational gain.
        const recovered: string[] = []
        const re = /"((?:[^"\\]|\\.)*)"/g
        let m: RegExpExecArray | null
        while ((m = re.exec(raw))) {
          try {
            recovered.push(JSON.parse('"' + m[1] + '"'))
          } catch {
            // ignore individual decode errors
          }
        }
        result.resourcePacks = recovered
      }
    }

    return result
  }

  async editIrisShaderOptions(options: EditShaderOptions): Promise<void> {
    const instancePath = options.instancePath
    const pack = options.shaderPack
    await this.#editShaderOptions(pack, instancePath, 'iris.properties')
  }

  async getIrisShaderOptions(instancePath: string): Promise<Record<string, string>> {
    return this.#getProperties(instancePath, 'iris.properties')
  }

  async editOculusShaderOptions(options: EditShaderOptions): Promise<void> {
    const instancePath = options.instancePath
    const pack = options.shaderPack
    await this.#editShaderOptions(pack, instancePath, 'oculus.properties')
  }

  async getOculusShaderOptions(instancePath: string): Promise<Record<string, string>> {
    return this.#getProperties(instancePath, 'oculus.properties')
  }

  async #writeShaderProperties(instancePath: string, engine: ShaderEngine, patch: Record<string, string>) {
    await this.#javaInstance(instancePath)
    return this.mutex.of('resource-pack-options').runExclusive(() => this.mutex.of(LockKey.instance(instancePath)).runExclusive(async () => {
      await this.#javaInstance(instancePath)
      const launch = await this.app.registry.get(LaunchService)
      if ((await launch.getGameProcesses()).some(process => process.options.gameDirectory === instancePath)) throw new AnyError('InstanceRunningError')
      if (patch.shaderPack && !['OFF', '(internal)'].includes(patch.shaderPack) && importPathParts(patch.shaderPack).length !== 1) throw new Error('Invalid shader selection')
      const before = await readShaderProperties(instancePath, engine)
      await writeShaderProperties(instancePath, engine, patch, before.snapshot)
    }))
  }

  async #editShaderOptions(pack: string, instancePath: string, name: 'iris.properties' | 'oculus.properties') {
    await this.#writeShaderProperties(instancePath, name === 'iris.properties' ? 'iris' : 'oculus', { shaderPack: pack, enableShaders: pack ? 'true' : 'false' })
  }

  async #getProperties(instancePath: string, name: 'iris.properties' | 'oculus.properties') {
    await this.#javaInstance(instancePath)
    return { ...(await readShaderProperties(instancePath, name === 'iris.properties' ? 'iris' : 'oculus')).values }
  }

  async editShaderOptions(options: EditShaderOptions): Promise<void> {
    const { instancePath, ...patch } = options
    await this.#writeShaderProperties(instancePath, 'optifine', patch)
  }

  async editGameSetting(options: EditGameSettingOptions) {
    const instancePath = options.instancePath
    const current = await this.getGameOptions(instancePath)

    const diff: Frame = {}
    if (Object.keys(current).length !== 0) {
      for (const key of Object.keys(options)) {
        if (key === 'instancePath') continue
        if (key in current && (current as any)[key] !== (options as any)[key]) {
          ;(diff as any)[key] = (options as any)[key]
        }
      }
    } else {
      for (const key of Object.keys(options)) {
        if (key === 'instancePath') continue
        ;(diff as any)[key] = (options as any)[key]
      }
    }
    if (diff.lang) {
      diff.lang = diff.lang.toLowerCase().replace('-', '_')
    }
    if (options.resourcePacks && !current.resourcePacks) {
      diff.resourcePacks = options.resourcePacks
    }
    if (Object.keys(diff).length > 0) {
      this.log(`Edit gamesetting: ${JSON.stringify(diff, null, 4)} to ${instancePath}`)
      const optionsTxtPath = join(instancePath, 'options.txt')
      Object.assign(current, diff)
      await writeFile(
        optionsTxtPath,
        Object.entries(current)
          .map(([k, v]) => (typeof v !== 'string' ? `${k}:${JSON.stringify(v)}` : `${k}:${v}`))
          .join('\n') + '\n',
      )
    }
  }

  async showOptionsFileInFolder(path: string) {
    const optionTxt = join(path, 'options.txt')
    if (await missing(optionTxt)) {
      this.app.shell.openDirectory(path)
    } else {
      this.app.shell.showItemInFolder(optionTxt)
    }
  }

  async showShaderOptionsInFolder(path: string) {
    const optionTxt = join(path, 'optionsshaders.txt')
    if (await missing(optionTxt)) {
      this.app.shell.openDirectory(path)
    } else {
      this.app.shell.showItemInFolder(optionTxt)
    }
  }
}
