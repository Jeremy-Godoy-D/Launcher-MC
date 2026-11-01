import { createServer, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { makeReactResourcePack } from '../../helpers/react-content'
import { javaWorldLock } from '../../helpers/java-world-lock'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
const undiciModule = require.resolve('undici')

for (const provider of ['modrinth', 'curseforge'] as const) test(`Native ${provider} datapack download stays staged until verified publication and preserves world bytes`, async ({ launcher }, testInfo) => {
  const page = launcher.main
  const instance = await page.evaluate(() => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Market world', runtime: { minecraft: '1.21.1' } }))
  const world = await makeReactWorld(instance, 'Alpha'), worldBytes = await readFile(join(world, 'level.dat'))
  const source = join(launcher.gameDataPath, 'market-source')
  await makeReactResourcePack(source, 'Market', 'Native market fixture', 48)
  const bytes = await readFile(join(source, 'resourcepacks/Market.zip')), sha1 = createHash('sha1').update(bytes).digest('hex')
  let requested = false, released = false, responseBytes = bytes
  const responses = new Set<ServerResponse>()
  const finish = () => { released = true; for (const response of responses) if (!response.writableEnded) response.end(responseBytes) }
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-length': responseBytes.length, 'content-type': 'application/zip' })
    if (request.method === 'HEAD') { response.end(); return }
    requested = true; responses.add(response); response.once('close', () => responses.delete(response))
    if (released) response.end(responseBytes); else response.flushHeaders()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture server')
  const url = `http://127.0.0.1:${address.port}/Market.zip`
  let installing: Promise<any> | undefined
  try {
    await launcher.app.evaluate((_electron, { undiciModule, url, sha1, size }) => {
      const loader = process.getBuiltinModule('module')!.createRequire(undiciModule)
      const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = loader(undiciModule)
      const previous = getGlobalDispatcher(), agent = new MockAgent(), calls: string[] = []
      const versions = [{ id: 'version1', project_id: 'project1', name: 'Native fixture', version_number: '1', loaders: ['datapack'], game_versions: ['1.21.1'], dependencies: [], files: [{ filename: 'Market.zip', url, primary: true, size, hashes: { sha1 } }] }]
      agent.disableNetConnect(); agent.enableNetConnect(/127\.0\.0\.1/)
      const pool = agent.get(/^https:\/\//)
      pool.intercept({ path: /^\/v2\/versions\?/, method: 'GET' }).reply(() => {
        calls.push('modrinth')
        return { statusCode: 200, data: JSON.stringify((globalThis as any).__worldMarketNetwork.versions), responseOptions: { headers: { 'content-type': 'application/json' } } }
      }).persist()
      pool.intercept({ path: '/v1/mods/files', method: 'POST' }).reply(() => {
        calls.push('curseforge')
        return { statusCode: 200, data: JSON.stringify({ data: [{ id: 456, modId: 123, gameId: 432, displayName: 'Native fixture', fileName: 'Market.zip', downloadUrl: url, fileLength: size, hashes: [{ algo: 1, value: sha1 }], dependencies: [], gameVersions: ['1.21.1'], isAvailable: true, releaseType: 1 }] }), responseOptions: { headers: { 'content-type': 'application/json' } } }
      }).persist()
      ;(globalThis as any).__worldMarketNetwork = { calls, versions, restore: async () => { setGlobalDispatcher(previous); await agent.close() } }
      setGlobalDispatcher(agent)
    }, { undiciModule, url, sha1, size: bytes.length })
    const input = provider === 'modrinth' ? { market: 0, version: { versionId: 'version1' }, savePath: world } : { market: 1, file: { fileId: 456 }, savePath: world }
    installing = page.evaluate(async input => {
      try { return { paths: await (window as any).serviceChannels.open('InstanceSavesService').call('installDatapackFromMarket', input) } }
      catch (error) { return { error } }
    }, input)
    await expect.poll(() => requested, { timeout: 10000 }).toBe(true)
    await expect(lstat(join(world, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
    expect((await readdir(launcher.gameDataPath)).filter(name => name.startsWith('.datapack-download-'))).toHaveLength(1)
    finish()
    const result = await installing
    expect(result.error, JSON.stringify(result.error)).toBeUndefined()
    expect(result.paths).toEqual([join(world, 'datapacks/Market.zip')])
    expect(await readFile(result.paths[0])).toEqual(bytes)
    expect((await lstat(result.paths[0], { bigint: true })).nlink).toBe(1n)
    const metadata = JSON.parse(await readFile(join(world, `datapacks/.Market.zip.${provider}`), 'utf8'))
    expect(metadata).toEqual(provider === 'modrinth' ? { projectId: 'project1', versionId: 'version1' } : { projectId: 123, fileId: 456 })
    expect((await readdir(launcher.gameDataPath)).filter(name => name.startsWith('.datapack-download-'))).toEqual([])
    expect(await readFile(join(world, 'level.dat'))).toEqual(worldBytes)
    const calls = await launcher.app.evaluate(() => (globalThis as any).__worldMarketNetwork.calls)
    expect(calls).toContain(provider)
    const external = await javaWorldLock(world); expect(external.status).toBe('LOCKED')
    try {
      expect(await page.evaluate(async input => { try { await (window as any).serviceChannels.open('InstanceSavesService').call('installDatapackFromMarket', input); return false } catch { return true } }, input)).toBe(true)
      expect(await launcher.app.evaluate(() => (globalThis as any).__worldMarketNetwork.calls)).toEqual(calls)
    } finally { await external.release() }
    if (provider === 'modrinth') {
      const failedWorld = await makeReactWorld(instance, 'Failed batch')
      requested = false; released = false; responseBytes = Buffer.concat([bytes, Buffer.from(' NEXT FIXTURE')])
      await launcher.app.evaluate((_electron, { url, size, sha1 }) => {
        const base = { project_id: 'project1', name: 'Batch fixture', version_number: '1', loaders: ['datapack'], game_versions: ['1.21.1'], dependencies: [] }
        ;(globalThis as any).__worldMarketNetwork.versions = [
          { ...base, id: 'invalid1', files: [{ filename: 'Invalid.zip', url: 'invalid-url', primary: true, size, hashes: { sha1: '0'.repeat(40) } }] },
          { ...base, id: 'held0001', files: [{ filename: 'Held.zip', url, primary: true, size, hashes: { sha1 } }] },
        ]
      }, { url: url + '?held', size: responseBytes.length, sha1: createHash('sha1').update(responseBytes).digest('hex') })
      let settled = false
      installing = page.evaluate(async savePath => {
        try { return { paths: await (window as any).serviceChannels.open('InstanceSavesService').call('installDatapackFromMarket', { market: 0, version: [{ versionId: 'invalid1' }, { versionId: 'held0001' }], savePath }) } }
        catch (error) { return { error } }
      }, failedWorld).then(result => { settled = true; return result })
      await expect.poll(() => requested, { timeout: 10000 }).toBe(true)
      expect(settled).toBe(false)
      expect((await readdir(launcher.gameDataPath)).filter(name => name.startsWith('.datapack-download-'))).toHaveLength(1)
      finish(); expect((await installing).error).toBeDefined()
      await expect(lstat(join(failedWorld, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
      expect((await readdir(launcher.gameDataPath)).filter(name => name.startsWith('.datapack-download-'))).toEqual([])
    }
    await writeFile(testInfo.outputPath('market-result.json'), JSON.stringify({ provider, sha1, bytes: bytes.length, paths: result.paths, metadata, calls, gameStarted: false }, null, 2))
  } finally {
    finish(); await installing
    await launcher.app.evaluate(async () => { await (globalThis as any).__worldMarketNetwork?.restore() })
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
