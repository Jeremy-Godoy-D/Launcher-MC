import { InstanceLogServiceKey, type InstanceLogService as IInstanceLogService } from '@xmcl/runtime-api'
import { AnyError } from '@xmcl/utils'
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Inject, LauncherAppKey } from '~/app'
import { kEncodingWorker, type EncodingWorker } from '~/encoding'
import { AbstractService, ALL_PARAMS, ExposeServiceKey, Singleton } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { LaunchHistoryStore } from '../launch/LaunchHistoryStore'
import { UTF8 } from '../util/encoding'
import { InstanceService } from './InstanceService'
import { listLocalLogs, localLogPath, readLocalLog, removeLocalLog, type LogArea } from './utils/localLogs'

@ExposeServiceKey(InstanceLogServiceKey)
export class InstanceLogService extends AbstractService implements IInstanceLogService {
  private launchHistory: LaunchHistoryStore

  constructor(@Inject(LauncherAppKey) app: LauncherApp,
    @Inject(kEncodingWorker) private encoder: EncodingWorker,
  ) {
    super(app)
    this.launchHistory = new LaunchHistoryStore(this.getAppDataPath('launch-history'))
  }

  async #javaRoot(path: string) {
    if (typeof path !== 'string' || path.length > 32768 || !isAbsolute(path)) throw new AnyError('InstanceNotFoundError')
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    if (!instances.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
    return realpath(path).catch(() => { throw new AnyError('InstanceLogReadError') })
  }

  async listLaunches(instancePath: string) {
    await this.#javaRoot(instancePath)
    return this.launchHistory.list(instancePath)
  }

  async getLaunch(instancePath: string, launchId: string) {
    await this.#javaRoot(instancePath)
    return this.launchHistory.get(instancePath, launchId)
  }

  async getLaunchEvidence(instancePath: string, launchId: string, name: 'game.log' | 'debug.log' | 'crash-report.txt' | 'launcher-output.log') {
    await this.#javaRoot(instancePath)
    return this.launchHistory.readEvidence(instancePath, launchId, name)
  }

  async findLaunchByCrashReport(instancePath: string, name: string) {
    const content = await this.getCrashReportContent(instancePath, name)
    return this.launchHistory.findByCrashReport(instancePath, content)
  }

  @Singleton(ALL_PARAMS)
  async listLogs(instancePath: string) {
    return listLocalLogs(await this.#javaRoot(instancePath), 'logs')
  }

  @Singleton(ALL_PARAMS)
  async listServerLogs(instancePath: string) {
    return listLocalLogs(await this.#javaRoot(instancePath), 'server/logs')
  }

  @Singleton(ALL_PARAMS)
  async listCrashReports(instancePath: string) {
    return listLocalLogs(await this.#javaRoot(instancePath), 'crash-reports')
  }

  async #read(root: string, area: LogArea, name: string) {
    const buffer = await readLocalLog(root, area, name)
    if (!buffer) return ''
    try {
      const encoding = await this.encoder.guessEncodingByBuffer(buffer).catch(() => undefined)
      return await this.encoder.decode(buffer, encoding || UTF8)
    } catch { throw new AnyError('InstanceLogReadError') }
  }

  @Singleton(ALL_PARAMS)
  async getLogContent(instancePath: string, name: string) {
    return this.#read(await this.#javaRoot(instancePath), 'logs', name)
  }

  @Singleton(ALL_PARAMS)
  async getServerLogContent(instancePath: string, name: string) {
    return this.#read(await this.#javaRoot(instancePath), 'server/logs', name)
  }

  @Singleton(ALL_PARAMS)
  async getCrashReportContent(instancePath: string, name: string) {
    const root = await this.#javaRoot(instancePath)
    if (typeof name === 'string' && isAbsolute(name.trim())) {
      const absolute = resolve(name.trim())
      // Older exit events contain an absolute client or dedicated-server report.
      for (const area of ['crash-reports', 'server/crash-reports'] as const) {
        if ([root, resolve(instancePath)].some(base => !relative(join(base, area), dirname(absolute)))) return this.#read(root, area, basename(absolute))
      }
      throw new AnyError('InstanceLogUnsafePath')
    }
    return this.#read(root, 'crash-reports', name)
  }

  @Singleton(ALL_PARAMS)
  async removeLog(instancePath: string, name: string) {
    return removeLocalLog(await this.#javaRoot(instancePath), 'logs', name)
  }

  @Singleton(ALL_PARAMS)
  async removeServerLog(instancePath: string, name: string) {
    return removeLocalLog(await this.#javaRoot(instancePath), 'server/logs', name)
  }

  @Singleton(ALL_PARAMS)
  async removeCrashReport(instancePath: string, name: string) {
    return removeLocalLog(await this.#javaRoot(instancePath), 'crash-reports', name)
  }

  async showLog(instancePath: string, name: string) {
    this.app.shell.showItemInFolder(await localLogPath(await this.#javaRoot(instancePath), 'logs', name))
  }

  async showServerLog(instancePath: string, name: string) {
    this.app.shell.showItemInFolder(await localLogPath(await this.#javaRoot(instancePath), 'server/logs', name))
  }

  async showCrash(instancePath: string, name: string) {
    this.app.shell.showItemInFolder(await localLogPath(await this.#javaRoot(instancePath), 'crash-reports', name))
  }
}
