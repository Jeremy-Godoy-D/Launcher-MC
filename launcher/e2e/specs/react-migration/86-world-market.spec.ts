import { createServer, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { makeReactResourcePack } from '../../helpers/react-content'
import { javaWorldLock } from '../../helpers/java-world-lock'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

for (const provider of ['modrinth', 'curseforge'] as const) test(`Native ${provider} datapack download stays staged until verified publication and preserves world bytes`, async ({ launcher }, testInfo) => {
  const page = launcher.main
  const instance = await page.evaluate(() => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Market world', runtime: { minecraft: '1.21.1' } }))
  const world = await makeReactWorld(instance, 'Alpha'), worldBytes = await readFile(join(world, 'level.dat'))
  const source = join(launcher.gameDataPath, 'market-source')
  await makeReactResourcePack(source, 'Market', 'Native market fixture', 48)
  const bytes = await readFile(join(source, 'resourcepacks/Market.zip')), sha1 = createHash('sha1').update(bytes).digest('hex')
  let requested = false, released = false, responseBytes = bytes
  const calls: string[] = []
  let versions: any[] = []
  const responses = new Set<ServerResponse>()
  const finish = () => { released = true; for (const response of responses) if (!response.writableEnded) response.end(responseBytes) }
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://fixture').pathname
    if (path === '/v2/versions' || path === '/v1/mods/files') {
      calls.push(path === '/v2/versions' ? 'modrinth' : 'curseforge')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(path === '/v2/versions' ? versions : { data: [{ id: 456, modId: 123, gameId: 432, displayName: 'Native fixture', fileName: 'Market.zip', downloadUrl: url, fileLength: bytes.length, hashes: [{ algo: 1, value: sha1 }], dependencies: [], gameVersions: ['1.21.1'], isAvailable: true, releaseType: 1 }] }))
      return
    }
    response.writeHead(200, { 'content-length': responseBytes.length, 'content-type': 'application/zip' })
    if (request.method === 'HEAD') { response.end(); return }
    requested = true; responses.add(response); response.once('close', () => responses.delete(response))
    if (released) response.end(responseBytes); else response.flushHeaders()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture server')
  const url = `http://127.0.0.1:${address.port}/Market.zip`
  versions = [{ id: 'version1', project_id: 'project1', name: 'Native fixture', version_number: '1', loaders: ['datapack'], game_versions: ['1.21.1'], dependencies: [], files: [{ filename: 'Market.zip', url, primary: true, size: bytes.length, hashes: { sha1 } }] }]
  let installing: Promise<any> | undefined
  try {
    // Metadata uses Electron net.fetch; file bytes still use the native download pipeline.
    await launcher.app.evaluate(({ session }, base) => {
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://api.modrinth.com/v2/versions*', 'https://*/v1/mods/files'] }, (details: { url: string }, callback: (response: { redirectURL: string }) => void) => {
        const target = new URL(details.url)
        callback({ redirectURL: base + target.pathname + target.search })
      })
    }, `http://127.0.0.1:${address.port}`)
    const input = provider === 'modrinth' ? { market: 0, version: { versionId: 'version1' }, savePath: world } : { market: 1, file: { fileId: 456 }, savePath: world }
    let outcome: any
    installing = page.evaluate(async input => {
      try { return { paths: await (window as any).serviceChannels.open('InstanceSavesService').call('installDatapackFromMarket', input) } }
      catch (error) { return { error } }
    }, input).then(result => { outcome = result; return result })
    await expect.poll(() => requested || Boolean(outcome), { timeout: 10000 }).toBe(true)
    expect(outcome?.error, JSON.stringify(outcome?.error)).toBeUndefined()
    expect(requested, JSON.stringify({ outcome, calls })).toBe(true)
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
    expect(calls).toContain(provider)
    const beforeCalls = [...calls]
    const external = await javaWorldLock(world); expect(external.status).toBe('LOCKED')
    try {
      expect(await page.evaluate(async input => { try { await (window as any).serviceChannels.open('InstanceSavesService').call('installDatapackFromMarket', input); return false } catch { return true } }, input)).toBe(true)
      expect(calls).toEqual(beforeCalls)
    } finally { await external.release() }
    if (provider === 'modrinth') {
      const failedWorld = await makeReactWorld(instance, 'Failed batch')
      requested = false; released = false; responseBytes = Buffer.concat([bytes, Buffer.from(' NEXT FIXTURE')])
      const base = { project_id: 'project1', name: 'Batch fixture', version_number: '1', loaders: ['datapack'], game_versions: ['1.21.1'], dependencies: [] }, size = responseBytes.length
      versions = [
        { ...base, id: 'invalid1', files: [{ filename: 'Invalid.zip', url: 'invalid-url', primary: true, size, hashes: { sha1: '0'.repeat(40) } }] },
        { ...base, id: 'held0001', files: [{ filename: 'Held.zip', url: url + '?held', primary: true, size, hashes: { sha1: createHash('sha1').update(responseBytes).digest('hex') } }] },
      ]
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
    await launcher.app.evaluate(({ session }) => { session.defaultSession.webRequest.onBeforeRequest(null) })
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
