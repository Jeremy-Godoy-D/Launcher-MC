import { HAS_DEV_SERVER, HOST, IS_DEV, IS_REACT_RENDERER, WindowsBuild } from '@/constant'
import indexPreload from '@preload/index'
import migrationPreload from '@preload/migration'
import monitorPreload from '@preload/monitor'
import loggerWinUrl from '@renderer/logger.html'
import migrateWinUrl from '@renderer/migration.html'
import { parseOAuthRedirect } from '@xmcl/runtime/user/accountSystems/oauthRedirect'
import { InstalledAppManifest, Settings, type LoggerContext } from '@xmcl/runtime-api'
import { InstanceService } from '@xmcl/runtime/instance/InstanceService'
import { loggerContext } from '@xmcl/runtime/util/loggerContext'
import { Client, LauncherAppController, MicrosoftAuthTelemetryEvent } from '@xmcl/runtime/app'
import { Logger } from '@xmcl/runtime/infra'
import { kSettings } from '@xmcl/runtime/settings'
import { BrowserWindow, Event, HandlerDetails, Session, Tray, WebContents, app, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import ElectronLauncherApp from './ElectronLauncherApp'
import { plugins } from './controllers'
import defaultApp from './defaultApp'
import { definedLocales } from './definedLocales'
import { createI18n } from './utils/i18n'
import { darkIcon } from './utils/icons'
import { getLoginSuccessHTML } from './utils/login'
import { createWindowTracker } from './utils/windowSizeTracker'
import { isBootstrapSender } from './utils/bootstrapSender'
import { rendererNavigation, externalNavigation } from '@xmcl/runtime/util/rendererNavigation'

export class ElectronController implements LauncherAppController {
  protected windowsVersion?: { major: number; minor: number; build: number }

  protected mainWin: BrowserWindow | undefined = undefined

  protected loggerWin: BrowserWindow | undefined = undefined
  private loggerWindows = new Map<string, { context: LoggerContext; window?: BrowserWindow; opening?: Promise<void> }>()


  protected migrationRef: BrowserWindow | undefined = undefined

  protected i18n = createI18n(definedLocales, 'en')

  readonly logger: Logger

  protected tray: Tray | undefined

  /**
   * During the app is parking, even if the all windows are closed, the app will keep open.
   */
  protected parking = false

  protected activatedManifest: InstalledAppManifest | undefined

  protected sharedSession: Session | undefined

  private settings: Settings | undefined

  private migrated: { from: string; to: string } | undefined


  maximized: boolean | undefined

  private windowOpenHandler: Parameters<WebContents['setWindowOpenHandler']>[0] = (detail: HandlerDetails) => {
    const features = detail.features.split(',')
    const width = parseInt(features.find(f => f.startsWith('width'))?.split('=')[1] ?? '1024', 10)
    const height = parseInt(features.find(f => f.startsWith('height'))?.split('=')[1] ?? '768', 10)
    const minWidth = parseInt(features.find(f => f.startsWith('min-width'))?.split('=')[1] ?? '600', 10)
    const minHeight = parseInt(features.find(f => f.startsWith('min-height'))?.split('=')[1] ?? '600', 10)
    const man = this.activatedManifest!
    // Determine if translucency should be enabled (from user settings or app manifest)
    const enableTranslucency = this.settings?.windowTranslucent || man.vibrancy
    if (rendererNavigation(detail.url, man.url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          vibrancy: enableTranslucency && this.app.platform.os === 'osx' ? 'sidebar' : undefined, // macOS vibrancy
          icon: nativeTheme.shouldUseDarkColors ? man.iconSets.darkIcon : man.iconSets.icon,
          titleBarStyle: this.getTitlebarStyle(),
          trafficLightPosition: this.app.platform.os === 'osx' ? { x: 14, y: 10 } : undefined,
          minWidth,
          minHeight,
          width,
          height,
          show: false,
          frame: this.getFrameOption(),

          webPreferences: {
            preload: indexPreload,
            devTools: IS_DEV,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webviewTag: false,
          },
        },
      }
    }

    const external = externalNavigation(detail.url)
    if (external) void shell.openExternal(external).catch(error => this.logger.warn(error))
    return { action: 'deny' }
  }

  private onWebContentCreateWindow = (window: BrowserWindow) => {
    window.webContents.setWindowOpenHandler(this.windowOpenHandler)
    window.webContents.on('will-navigate', this.onWebContentWillNavigate)
    window.webContents.on('did-create-window', this.onWebContentCreateWindow)
    window.once('ready-to-show', () => {
      window.show()
    })
  }

  private onWebContentWillNavigate = (event: Event, url: string) => {
    if (!rendererNavigation(url, this.activatedManifest?.url ?? defaultApp.url) && !rendererNavigation(url, loggerWinUrl)) {
      event.preventDefault()
      const external = externalNavigation(url)
      if (external) void shell.openExternal(external).catch(error => this.logger.warn(error))
    }
  }

  constructor(protected app: ElectronLauncherApp) {
    plugins.forEach(p => p.call(this))

    if (app.platform.os === 'windows') {
      queueMicrotask(() => {
        this.windowsVersion = app.windowsUtils?.getWindowsVersion()
      })
    }

    this.app.on('window-all-closed', () => {
      if (process.platform !== 'darwin' && !this.parking) {
        this.app.quit()
      }
    })

    this.app.on('second-instance', () => {
      if (this.parking) {
        if (this.mainWin) {
          if (this.mainWin.isMinimized()) {
            this.mainWin.restore()
          } else if (!this.mainWin.isVisible()) {
            this.mainWin.show()
          }
          this.mainWin.focus()
        }
      }
    })

    this.logger = this.app.getLogger('Controller')

    protocol.registerSchemesAsPrivileged([{
      scheme: 'image',
      privileges: {
        stream: true,
        corsEnabled: true,
        supportFetchAPI: true,
        bypassCSP: true,
      },
    }])

    protocol.registerSchemesAsPrivileged([{
      scheme: 'video',
      privileges: {
        stream: true,
        corsEnabled: true,
        supportFetchAPI: true,
        bypassCSP: true,
      },
    }])
  }

  handle(channel: string, handler: (event: { sender: Client }, ...args: any[]) => any, once = false) {
    const guarded: typeof handler = channel === 'bootstrap' ? (event, ...args) => {
      const native = event as Electron.IpcMainInvokeEvent
      if (!isBootstrapSender(native, this.mainWin?.webContents, defaultApp.url)) throw new Error('Bootstrap requires the main launcher frame')
      return handler(event, ...args)
    } : handler
    if (!once) {
      return ipcMain.handle(channel, guarded)
    }
    return ipcMain.handleOnce(channel, guarded)
  }

  broadcast(channel: string, ...payload: any[]): void {
    BrowserWindow.getAllWindows().forEach(w => {
      try {
        w.webContents.send(channel, ...payload)
      } catch (e) {
        this.logger.warn(`Drop message to ${channel} to ${w.getTitle()} as`)
        if (e instanceof Error) {
          this.logger.warn(e)
        }
      }
    })
  }

  private setupBrowserLogger(ref: BrowserWindow, name: string) {
    const logger = this.app.getLogger(name, name)
    ref.webContents.on('console-message', (e) => {
      const message = e.message
      if (message.startsWith("Listener added for a synchronous 'DOMNodeRemoved' DOM Mutation Event. This event type is deprecated")) {
        return
      }
      if (e.level === 'info') {
        logger.log(message)
      } else if (e.level === 'warning' || e.level === 'error') {
        logger.warn(message)
      }
    })
    ref.once('close', () => {
      ref.webContents.removeAllListeners('console-message')
    })
  }

  private getBackgroundMaterial(enableTranslucency: boolean): 'none' | 'mica' | 'acrylic' | 'auto' | undefined {
    return undefined
    // const isWin = this.app.platform.os === 'windows'
    // if (!isWin) {
    //   return undefined
    // }
    // const windowsVersion = this.windowsVersion
    // const win11 = windowsVersion && windowsVersion.build >= WindowsBuild.Windows11
    // if (!enableTranslucency) {
    //   return win11 ? 'mica' : 'auto'
    // }
    // const win10 = windowsVersion && windowsVersion.build >= WindowsBuild.Windows10
    // if (!win10 && !win11) {
    //   return 'auto'
    // }
    // return 'acrylic'
  }

  async startMigrate() {
    // The migration runs from `LauncherApp.setup()`, which races with the
    // engine becoming ready. Creating a BrowserWindow before the app is ready
    // throws, so wait for readiness before showing the progress window.
    await app.whenReady()
    const restoredSession = this.app.session.getSession(defaultApp.url)
    const browser = new BrowserWindow({
      title: 'Grimo Launcher · Migración de datos',
      frame: false,
      resizable: false,
      width: 600,
      height: 400,
      webPreferences: {
        preload: migrationPreload,
        session: restoredSession,
      },
    })
    browser.loadURL(migrateWinUrl)

    this.migrationRef = browser
  }

  async endMigrate(result?: { from: string; to: string }) {
    this.migrated = result
    if (result && this.migrationRef && !this.migrationRef.isDestroyed()) {
      this.migrationRef.close()
    }
  }

  async activate(manifest: InstalledAppManifest, isBootstrap = false): Promise<void> {
    this.logger.log(`Activate app ${manifest.name} ${manifest.url}`)
    this.parking = true

    // close the old window
    if (this.mainWin && !this.mainWin.isDestroyed()) {
      this.mainWin.close()
    }

    this.activatedManifest = manifest

    try {
      await this.createAppWindow(isBootstrap)
    } finally {
      this.parking = false
    }
  }

  setWindowTranslucent(enable: boolean) {
    if (this.mainWin && !this.mainWin.isDestroyed()) {
      if (this.app.platform.os === 'osx') this.mainWin.setVibrancy(enable ? 'sidebar' : null)
      else if (this.app.platform.os === 'windows') this.mainWin.setBackgroundMaterial(this.getBackgroundMaterial(enable) ?? 'auto')
    }
  }

  async createAppWindow(isBootstrap: boolean) {
    const man = this.activatedManifest!
    const tracker = createWindowTracker(this.app, 'app-manager')
    const config = await tracker.getConfig()

    const restoredSession = this.app.session.getSession(man.url)
    const minWidth = man.minWidth ?? 800
    const minHeight = man.minHeight ?? 600
    const defaultWidth = man.defaultWidth ?? 800
    const defaultHeight = man.defaultHeight ?? 600

    // Ensure the settings is loaded for translucency and Linux titlebar options
    if (!this.settings) {
      this.settings = await this.app.registry.get(kSettings)
    }

    // Determine if translucency should be enabled (from user settings or app manifest)
    const enableTranslucency = this.settings?.windowTranslucent || man.vibrancy

    const browser = new BrowserWindow({
      title: man.name,
      width: config.getWidth(defaultWidth, minWidth),
      height: config.getHeight(defaultHeight, minHeight),
      x: config.x,
      y: config.y,
      minWidth: man.minWidth,
      minHeight: man.minHeight,
      frame: this.getFrameOption(),
      backgroundColor: enableTranslucency ? undefined : man.backgroundColor, // Transparent when translucency is enabled
      vibrancy: enableTranslucency && this.app.platform.os === 'osx' ? 'sidebar' : undefined, // macOS vibrancy
      backgroundMaterial: this.getBackgroundMaterial(enableTranslucency), // Windows mica/acrylic
      icon: nativeTheme.shouldUseDarkColors ? man.iconSets.darkIcon : man.iconSets.icon,
      titleBarStyle: this.getTitlebarStyle(),
      trafficLightPosition: this.app.platform.os === 'osx' ? { x: 14, y: 10 } : undefined,
      webPreferences: {
        preload: indexPreload,
        session: restoredSession,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
      },
      show: false,
    })


    if (man.ratio) {
      browser.setAspectRatio(minWidth / minHeight)
    }

    browser.on('ready-to-show', () => {
      this.logger.log('App Window is ready to show!')

      if (config.maximized) {
        browser.maximize()
      }

      if (!this.app.deferredWindowOpen) {
        browser.show()
        browser.focus()
      }
    })
    browser.webContents.on('will-navigate', this.onWebContentWillNavigate)
    browser.webContents.on('did-create-window', this.onWebContentCreateWindow)
    browser.webContents.setWindowOpenHandler(this.windowOpenHandler)
    browser.on('closed', () => {
      this.mainWin = undefined
    })

    this.setupBrowserLogger(browser, 'app')
    tracker.track(browser)

    const url = new URL(man.url)
    if (isBootstrap) {
      url.searchParams.append('bootstrap', 'true')
    }
    if (this.migrated) {
      url.searchParams.append('from', this.migrated.from)
      url.searchParams.append('to', this.migrated.to)
    }
    this.logger.log(url.toString())
    browser.loadURL(url.toString())

    this.logger.log(`Load main window url ${url.toString()}`)

    this.mainWin = browser
    browser.on('enter-full-screen', () => {
      this.maximized = true
    })
    browser.on('maximize', () => {
      this.maximized = true
    })
    browser.on('unmaximize', () => {
      this.maximized = false
    })

    this.app.emit('app-booted', man)
  }

  getLoggerWindow() {
    if (this.loggerWin?.isDestroyed()) {
      this.loggerWin = undefined
    }
    return this.loggerWin ?? [...this.loggerWindows.values()].find(entry => entry.window && !entry.window.isDestroyed())?.window
  }

  getLoggerContext(contents: WebContents) {
    const context = [...this.loggerWindows.values()].find(entry => entry.window?.webContents === contents)?.context
    return context ? { ...context } : undefined
  }

  getMigrationContext(contents: WebContents) {
    return this.mainWin?.webContents === contents && this.migrated ? { ...this.migrated } : undefined
  }

  async openLogger(instancePath: string, source?: string) {
    const context = loggerContext(instancePath, source)
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    if (!instances.state.instances.some(instance => instance.path === context.instancePath && instance.edition === 'java')) throw new Error('Logger instance not found')
    const key = JSON.stringify(context), previous = this.loggerWindows.get(key)
    if (previous) {
      await previous.opening
      if (previous.window && !previous.window.isDestroyed()) { previous.window.show(); previous.window.focus(); return }
    }
    const entry: { context: LoggerContext; window?: BrowserWindow; opening?: Promise<void> } = { context }
    this.loggerWindows.set(key, entry)
    entry.opening = this.createMonitorWindow(context).catch(error => {
      if (this.loggerWindows.get(key) === entry) this.loggerWindows.delete(key)
      if (entry.window && !entry.window.isDestroyed()) entry.window.close()
      throw error
    })
    await entry.opening
  }

  async createMonitorWindow(context?: LoggerContext) {
    const tracker = createWindowTracker(this.app, 'monitor')
    // Determine if translucency should be enabled
    const enableTranslucency = this.settings?.windowTranslucent ?? false

    const config = await tracker.getConfig()
    const browser = new BrowserWindow({
      title: IS_REACT_RENDERER ? 'Grimo Launcher' : 'KeyStone Monitor',
      width: config.getWidth(IS_REACT_RENDERER ? 900 : 600, 600),
      height: config.getHeight(IS_REACT_RENDERER ? 600 : 400, 400),
      x: config.x,
      y: config.y,
      minWidth: 600,
      minHeight: 400,
      frame: false,
      transparent: !IS_REACT_RENDERER,
      hasShadow: IS_REACT_RENDERER,
      maximizable: IS_REACT_RENDERER,
      icon: darkIcon,
      backgroundMaterial: this.getBackgroundMaterial(enableTranslucency), // Windows mica/acrylic
      webPreferences: {
        preload: monitorPreload,
        session: this.app.session.getSession(this.activatedManifest!.url),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    })

    this.setupBrowserLogger(browser, 'logger')
    browser.webContents.setWindowOpenHandler(this.windowOpenHandler)
    browser.webContents.on('will-navigate', this.onWebContentWillNavigate)

    if (context) {
      const key = JSON.stringify(context), entry = this.loggerWindows.get(key)!
      entry.window = browser
      browser.once('closed', () => { if (this.loggerWindows.get(key) === entry) this.loggerWindows.delete(key) })
    } else this.loggerWin = browser
    const url = IS_REACT_RENDERER ? new URL('logger.html', defaultApp.url).href : loggerWinUrl
    await browser.loadURL(url)
    browser.show(); tracker.track(browser)
  }

  requireFocus(): void {
    if (this.mainWin) {
      if (!this.mainWin.isVisible()) {
        this.mainWin.show()
      } else {
        this.mainWin.focus()
      }
    } else {
      this.getLoggerWindow()?.focus()
    }
  }

  async requestOpenExternalUrl(url: string) {
    const { t } = this.i18n
    const result = await dialog.showMessageBox(this.mainWin!, {
      type: 'question',
      title: t('openUrl.title', { url }),
      message: t('openUrl.message', { url }),
      checkboxLabel: t('openUrl.trust'),
      buttons: [t('openUrl.cancel'), t('openUrl.yes')],
    })
    return result.response === 1
  }

  private getFrameOption() {
    if (this.app.platform.os === 'linux') {
      return this.settings?.linuxTitlebar
    } else {
      return true
    }
  }

  private getTitlebarStyle() {
    return this.app.platform.os === 'linux' &&
      this.settings?.linuxTitlebar
      ? 'default'
      : 'hidden'
  }

  get activeWindow() {
    return this.mainWin ?? this.getLoggerWindow()
  }

  getNativeWindowHandle() {
    const window = this.activeWindow
    if (!window || window.isDestroyed()) {
      return undefined
    }
    return window.getNativeWindowHandle()
  }

  async openMicrosoftLogin(authorizationUrl: string, redirectUri: string, signal?: AbortSignal, authAttemptId?: string): Promise<string> {
    const redirect = new URL(redirectUri)
    await app.whenReady()
    return new Promise<string>((resolve, reject) => {
      let settled = false
      const startedAt = Date.now()
      let readyToShow = false
      let didFinishLoad = false
      let lastStage = 'created'
      let lastLoadErrorCode: number | undefined
      const parent = this.activeWindow
      const browser = new BrowserWindow({
        title: 'Sign in to Microsoft',
        width: 560,
        height: 720,
        minWidth: 420,
        minHeight: 600,
        parent,
        modal: !!parent,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: 'persist:xmcl-microsoft-login',
        },
        show: false,
      })
      const finish = (
        outcome: string,
        error?: Error,
        code?: string,
        extraProperties: Record<string, string | number | boolean> = {},
      ) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        if (authAttemptId) {
          const properties: MicrosoftAuthTelemetryEvent['properties'] = {
            authAttemptId,
            outcome,
            readyToShow,
            didFinishLoad,
            lastStage,
            ...extraProperties,
          }
          if (error) properties.errorName = error.name
          if (outcome === 'load_failed' && lastLoadErrorCode !== undefined) {
            properties.loadErrorCode = lastLoadErrorCode
          }
          this.app.emit('microsoft-auth-telemetry', {
            name: 'microsoft-auth-webview-result',
            properties,
            measurements: {
              durationMs: Date.now() - startedAt,
            },
          })
        }
        if (!browser.isDestroyed()) {
          browser.close()
        }
        if (error) reject(error)
        else resolve(code!)
      }
      const onAbort = () => {
        lastStage = 'aborted'
        const error = new Error('Microsoft authorization was cancelled.')
        error.name = 'AbortError'
        finish('aborted', error)
      }
      const onNavigate = (event: Event, url: string) => {
        const target = parseOAuthRedirect(url, redirect)
        if (!target) return
        event.preventDefault()
        lastStage = 'oauth_callback'
        const error = target.searchParams.get('error')
        if (error) {
          finish('oauth_error', new Error(target.searchParams.get('error_description') || error), undefined, {
            oauthError: /^[a-z0-9_.-]{1,128}$/i.test(error) ? error : 'other',
          })
          return
        }
        const code = target.searchParams.get('code')
        finish(code ? 'success' : 'no_code', code ? undefined : new Error('Microsoft authorization returned no code.'), code ?? undefined)
      }
      browser.webContents.on('will-navigate', onNavigate)
      browser.webContents.on('will-redirect', onNavigate)
      browser.webContents.on('did-finish-load', () => {
        didFinishLoad = true
        lastStage = 'did_finish_load'
      })
      browser.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        lastLoadErrorCode = errorCode
        lastStage = 'did_fail_load'
      })
      browser.webContents.on('render-process-gone', (_event, details) => {
        lastStage = 'render_process_gone'
        finish('renderer_gone', new Error('Microsoft authorization renderer exited.'), undefined, {
          reason: details.reason,
          exitCode: details.exitCode,
        })
      })
      browser.on('unresponsive', () => {
        lastStage = 'unresponsive'
      })
      browser.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const target = new URL(url)
          if (target.protocol === 'https:' || target.origin === redirect.origin) {
            lastStage = 'popup_navigation'
            void browser.loadURL(url).catch(error => {
              lastStage = 'popup_load_failed'
              finish('load_failed', error)
            })
          }
        } catch {
          // Ignore malformed popup targets from third-party identity pages.
        }
        return { action: 'deny' }
      })
      browser.once('ready-to-show', () => {
        readyToShow = true
        lastStage = 'ready_to_show'
        browser.show()
      })
      browser.once('closed', () => {
        const closeFromStage = lastStage
        lastStage = 'closed'
        finish('closed', new Error('Microsoft authorization window was closed.'), undefined, {
          closeFromStage,
        })
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      lastStage = 'loading_authorization_url'
      void browser.loadURL(authorizationUrl).catch(error => {
        lastStage = 'initial_load_failed'
        finish('load_failed', error)
      })
    })
  }

  getLoginSuccessHTML() {
    const title = this.i18n.t('urlSuccess')
    return getLoginSuccessHTML(title)
  }

  openDevTools() {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.closeDevTools()
        win.webContents.openDevTools({ mode: 'detach' })
      } catch {

      }
    }
  }
}
