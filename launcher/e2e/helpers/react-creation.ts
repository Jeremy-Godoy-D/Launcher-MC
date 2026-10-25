import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { LauncherFixture } from '../fixtures/launcher'

export async function mockCreationMetadata(launcher: LauncherFixture, fail = false, failApply = false) {
  await launcher.app.evaluate(({ ipcMain }, { fail, failApply }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    let failed = !fail
    let applyFailed = !failApply
    ;(globalThis as any).__creationCalls = []
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event, service, method, ...args) => {
      if (service === 'VersionMetadataService') {
        if (method === 'getMinecraftVersions') {
          if (!failed) { failed = true; throw new Error('Fixture version list unavailable') }
          return { result: { latest: { release: '1.21.1', snapshot: '24w33a' }, versions: [{ id: '1.21.1', type: 'release' }, { id: '1.20.4', type: 'release' }, { id: '24w33a', type: 'snapshot' }] } }
        }
        const results: Record<string, unknown> = {
          getFabricVersions: { gameVersions: ['1.21.1'], loaderVersions: [{ version: '0.16.0' }] },
          getQuiltVersions: { gameVersions: ['1.21.1'], loaderVersions: [{ version: '0.26.0' }] },
          getForgeVersions: [{ mcversion: '1.21.1', version: '52.0.0' }],
          getNeoForgedVersions: ['21.1.1'],
          getOptifineVersions: [{ mcversion: '1.21.1', type: 'HD_U', patch: 'J1' }],
          getLabyModManifest: { minecraftVersions: [{ tag: '1.21.1' }], labyModVersion: '4' },
        }
        return { result: results[method] }
      }
      if (service === 'InstanceService' && method === 'createInstance') (globalThis as any).__creationCalls.push(args[0])
      if (service === 'InstanceInstallService' && method === 'applyInstanceInstallManifest' && !applyFailed) {
        applyFailed = true
        throw new Error('Fixture apply interrupted before native work')
      }
      return original(event, service, method, ...args)
    })
  }, { fail, failApply })
}

export async function makeReactModpack(path: string, unsafe = false) {
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url))
  const { ZipFile } = require('yazl')
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', versionId: 'qa', name: 'Import QA', summary: 'Synthetic local regression pack', files: unsafe ? [{ path: '../outside.txt', hashes: { sha1: '0'.repeat(40) }, downloads: ['https://cdn.modrinth.com/qa'], fileSize: 1 }] : [], dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' } })), 'modrinth.index.json')
  zip.addBuffer(Buffer.from(JSON.stringify({ preExecuteCommand: 'not-executed-qa', java: 'untrusted-qa.exe', vmOptions: ['-javaagent:untrusted-qa.jar'], hideLauncher: true })), 'xmcl.json')
  zip.addBuffer(Buffer.from('preserved-import-fixture'), 'overrides/config/qa.txt')
  const writing = pipeline(zip.outputStream, createWriteStream(path))
  zip.end()
  await writing
}
