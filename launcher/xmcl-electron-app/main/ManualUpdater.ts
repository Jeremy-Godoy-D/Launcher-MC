import type { LauncherAppUpdater } from '@xmcl/runtime/app'
import { ElectronUpdateOperation, type ReleaseInfo } from '@xmcl/runtime-api'

export class ManualUpdater implements LauncherAppUpdater {
  constructor(private readonly version: () => string) {}

  async checkUpdateTask(): Promise<ReleaseInfo> {
    return {
      name: this.version(),
      body: 'Launcher MC se actualiza manualmente. Esta versión no consulta feeds externos.',
      date: '',
      files: [],
      newUpdate: false,
      operation: ElectronUpdateOperation.Manual,
    }
  }

  async downloadUpdate(): Promise<void> {
    throw new Error('Las actualizaciones automáticas están desactivadas en Launcher MC.')
  }

  async installUpdateAndQuit(): Promise<void> {
    throw new Error('Las actualizaciones automáticas están desactivadas en Launcher MC.')
  }
}
