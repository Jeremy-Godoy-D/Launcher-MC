import ElectronLauncherApp from '@/ElectronLauncherApp'
import { Logger } from '@xmcl/runtime/infra'

export function getWindowsUtils(app: ElectronLauncherApp, logger: Logger) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const utils = require('@xmcl/windows-utils')
    if (typeof utils?.getWindowsVersion !== 'function') {
      logger.warn('Fail to load windows utils!')
      return undefined
    }
    logger.log('Success to load windows utils!')
    return utils as typeof import('@xmcl/windows-utils')
  } catch (e) {
    logger.warn('Fail to load windows utils!')
    return undefined
  }
}
