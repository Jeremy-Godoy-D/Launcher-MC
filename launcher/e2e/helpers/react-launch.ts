import type { LauncherFixture } from '../fixtures/launcher'

/** Only provider installation/Java and synthetic process bookkeeping are replaced; no Java process is spawned. */
export async function mockLaunchRuntime(
  launcher: LauncherFixture,
  javaMode: 'available' | 'download' | 'fail' = 'available',
) {
  await launcher.app.evaluate(({ ipcMain, BrowserWindow }, javaMode) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    const processes = new Map<number, any>()
    let javaAvailable = javaMode === 'available'
    ;(globalThis as any).__launchCalls = []
    ;(globalThis as any).__launchTrace = []
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event, service, method, ...args) => {
      ;(globalThis as any).__launchTrace.push(`${service}.${method}`)
      if (service === 'VersionInstallService' && method === 'diagnose') return { result: undefined }
      if (service === 'VersionInstallService' && method === 'installInstance')
        return { result: { version: '1.21.1', duration: 0, timings: [], timestamp: Date.now() } }
      if (service === 'VersionInstallService' && method === 'install' && args[0].type === 'java') {
        if (javaMode === 'fail') throw new Error('Fixture unavailable Java download')
        javaAvailable = true
        return { result: undefined }
      }
      if (service === 'JavaService' && method === 'refreshLocalJava') {
        javaAvailable = true
        return { result: undefined }
      }
      if (service === 'JavaService' && method === 'getJavaState') {
        const response = await original(event, service, method, ...args)
        response.result.all = javaAvailable
          ? [{ path: 'fixture-java-never-spawned', majorVersion: 21, version: '21', valid: true }]
          : []
        return response
      }
      if (service === 'JavaService' && method === 'resolveJava')
        return {
          result: {
            path: 'fixture-java-never-spawned',
            majorVersion: 21,
            version: '21',
            valid: true,
          },
        }
      if (service === 'AuthlibInjectorService' && method === 'getOrInstallAuthlibInjector')
        return { result: 'fixture-authlib-never-loaded.jar' }
      if (service === 'LaunchService' && method === 'getGameProcesses')
        return { result: [...processes.values()] }
      if (service === 'LaunchService' && method === 'kill') {
        const process = processes.get(args[0])
        if (process) {
          processes.delete(args[0])
          for (const win of BrowserWindow.getAllWindows())
            win.webContents.send('service-event', {
              service,
              event: 'minecraft-exit',
              args: [{ pid: args[0], launchId: process.launchId, code: 0 }],
            })
        }
        return { result: undefined }
      }
      const response = await original(event, service, method, ...args)
      if (service === 'VersionService' && method === 'resolveLocalVersion' && response.result) {
        response.result = {
          ...response.result,
          javaVersion: { majorVersion: 21, component: 'java-runtime-delta' },
          compatibleJavaMajors: [21],
        }
      }
      if (service === 'LaunchService' && method === 'launch') {
        ;(globalThis as any).__launchCalls.push(args[0])
        processes.set(response.result, {
          pid: response.result,
          launchId: 'fixture-recovered-process',
          options: args[0],
        })
      }
      return response
    })
  }, javaMode)
}

export async function addLaunchProfile(launcher: LauncherFixture) {
  await launcher.main.evaluate(async () => {
    const user = await (window as any).serviceChannels
      .open('UserService')
      .call('login', { username: 'Launch_QA', authority: 'x://dev' })
    localStorage.setItem('selectedUserId', user.id)
  })
  await launcher.main.reload()
}
