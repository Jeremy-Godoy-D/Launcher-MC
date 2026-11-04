import { ElectronController } from '@/ElectronController'
import { ControllerPlugin } from './plugin'
import { nativeTheme } from 'electron'

export const themePlugin: ControllerPlugin = function (this: ElectronController) {
  nativeTheme.themeSource = 'system'
}
