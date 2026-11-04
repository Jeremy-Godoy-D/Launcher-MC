import { ElectronController } from '@/ElectronController'
import { isMonitorSelectionSupported, moveWindowToMonitor } from '@/utils/moveWindowToMonitor'
import { LaunchService } from '@xmcl/runtime/launch'
import { screen, systemPreferences } from 'electron'
import { ControllerPlugin } from './plugin'
import { IS_REACT_RENDERER } from '@/constant'

/**
 * Control the behavior of window during game launch/exit, and also redirect the minecraft stdout/stderr during game
 */
export const gameLaunch: ControllerPlugin = function (this: ElectronController) {
  this.app.waitEngineReady().then(() => {
    this.app.registry.get(LaunchService).then((service) => {
      service.on('minecraft-window-ready', ({ hideLauncher, pid, resolution }) => {
        if (isMonitorSelectionSupported() && resolution?.fullscreen && resolution.monitor) {
          const monitor = screen.getAllDisplays().find(display => String(display.id) === resolution.monitor)
          if (monitor) {
            if (process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(true)) {
              moveWindowToMonitor(pid, monitor.bounds).catch((error) => this.logger.warn(error))
            } else {
              this.logger.warn('macOS Accessibility permission is required to move Minecraft to another monitor')
            }
          }
        }
        if (this.mainWin && !this.mainWin.isDestroyed() && (this.mainWin.isVisible() || this.mainWin.isMinimized())) {
          const wc = this.mainWin.webContents
          if (wc && !wc.isDestroyed()) {
            try {
              wc.send('minecraft-window-ready')
            } catch {
              // window torn down mid-send
            }
          }

          if (hideLauncher) {
            this.mainWin.hide()
          }
        }
      }).on('minecraft-start', ({ showLog, gameDirectory }) => {
        this.parking = service.getProcesses().length > 0
        if (showLog) void (IS_REACT_RENDERER ? this.openLogger(gameDirectory) : !this.getLoggerWindow() ? this.createMonitorWindow() : Promise.resolve()).catch(error => this.logger.warn(error))
      }).on('minecraft-exit', (status) => {
        this.parking = service.getProcesses().length > 0
        if (this.mainWin && !this.mainWin.isDestroyed() && !this.mainWin.isVisible()) {
          this.mainWin.show()
        }
        this.app.controller.broadcast('minecraft-exit', status)
        const loggerWin = this.getLoggerWindow()
        if (loggerWin && !IS_REACT_RENDERER) {
          if (service.getProcesses().length === 0 && !status.crashReport && status.code === 0) {
            loggerWin.close()
            this.loggerWin = undefined
          }
        }
      })
    })
  })
}
