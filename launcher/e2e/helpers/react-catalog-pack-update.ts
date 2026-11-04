import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { LauncherFixture } from '../fixtures/launcher'
import { catalogImage, mockReactCatalog } from './react-catalog'

export async function mockPackUpdates(launcher: LauncherFixture, worldChanges = false) {
  const assets: { provider: string; version: number; bytes: Buffer; path: string; hash: string }[] = []
  const extra = Buffer.from('PACK UPDATE PAYLOAD\n'.repeat(8192)), extraHash = createHash('sha1').update(extra).digest('hex')
  const state = { slow: false, fileStarted: false, fileAborted: false, release: () => {} }
  let base = ''
  const mr = (version: number) => ({ id: `VVVV000${version}`, project_id: 'AAAA0001', name: `Pack ${version}`, version_number: String(version), date_published: `2026-10-0${version}T00:00:00Z`, version_type: 'release', game_versions: ['1.21.1'], loaders: ['fabric'], dependencies: [], files: [{ primary: true, filename: `pack${version}.mrpack`, url: `${base}/archive/modrinth/${version}`, size: assets.find(asset => asset.provider === 'modrinth' && asset.version === version)?.bytes.length, hashes: { sha1: assets.find(asset => asset.provider === 'modrinth' && asset.version === version)?.hash } }] })
  const cf = (version: number) => ({ id: 100 + version, modId: 1, gameId: 432, displayName: `Pack ${version}`, fileName: `pack${version}.zip`, fileDate: `2026-10-0${version}T00:00:00Z`, releaseType: 1, isAvailable: true, downloadUrl: `${base}/archive/curseforge/${version}`, fileLength: assets.find(asset => asset.provider === 'curseforge' && asset.version === version)?.bytes.length, hashes: [{ algo: 1, value: assets.find(asset => asset.provider === 'curseforge' && asset.version === version)?.hash }], gameVersions: ['1.21.1'], dependencies: [] })
  const project = { id: 1, gameId: 432, classId: 4471, name: 'Pack update QA', summary: 'Owned pack update fixture', authors: [{ name: 'QA' }], downloadCount: 1, logo: { url: catalogImage }, screenshots: [], links: { websiteUrl: 'https://www.curseforge.com/minecraft/modpacks/qa' } }
  const fixture = await mockReactCatalog(launcher, undefined, (url, _request, response) => {
    const json = (value: unknown) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (url.pathname.startsWith('/archive/')) {
      const [, , provider, version] = url.pathname.split('/'), asset = assets.find(asset => asset.provider === provider && asset.version === Number(version))
      if (!asset) { response.writeHead(404); response.end() } else { response.writeHead(200, { 'content-length': asset.bytes.length }); response.end(asset.bytes) }
    } else if (url.pathname === '/extra.bin') {
      state.fileStarted = true; response.writeHead(200, { 'content-length': extra.length })
      if (state.slow) { response.write(extra.subarray(0, 64)); response.once('close', () => { if (!response.writableEnded) state.fileAborted = true }); state.release = () => { if (!response.destroyed) response.end(extra.subarray(64)) } }
      else response.end(extra)
    } else if (url.pathname === '/modrinth/v2/search') json({ hits: [{ project_id: 'AAAA0001', project_type: 'modpack', title: project.name, description: project.summary, author: 'QA', downloads: 1, versions: ['1.21.1'], categories: ['fabric'], icon_url: catalogImage }], total_hits: 1 })
    else if (url.pathname === '/modrinth/v2/project/AAAA0001') json({ id: 'AAAA0001', project_type: 'modpack', title: project.name, description: project.summary, body: 'Owned fixture', downloads: 1, icon_url: catalogImage, gallery: [] })
    else if (url.pathname === '/modrinth/v2/project/AAAA0001/version') json([mr(2), mr(1)])
    else if (url.pathname === '/modrinth/v2/versions') json((JSON.parse(url.searchParams.get('ids') || '[]') as string[]).map(id => mr(Number(id.slice(-1)))))
    else if (url.pathname.startsWith('/modrinth/v2/version_files')) json({})
    else if (url.pathname === '/curseforge/v1/mods/search') json({ data: [project], pagination: { totalCount: 1 } })
    else if (url.pathname === '/curseforge/v1/mods/1') json({ data: project })
    else if (url.pathname === '/curseforge/v1/mods/1/description') json({ data: '<p>Owned fixture</p>' })
    else if (url.pathname === '/curseforge/v1/mods/1/files') json({ data: [cf(2), cf(1)], pagination: { totalCount: 2 } })
    else if (url.pathname === '/curseforge/v1/mods/files') json({ data: [cf(2)] })
    else if (url.pathname.startsWith('/curseforge/v1/fingerprints')) json({ data: { exactMatches: [], partialMatches: [], exactFingerprints: [], partialMatchFingerprints: [], unmatchedFingerprints: [] } })
    else return false
    return true
  })
  base = fixture.base
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl')
  for (const provider of ['modrinth', 'curseforge']) for (const version of [1, 2]) {
    const path = join(launcher.appDataPath, `${provider}-${version}.${provider === 'modrinth' ? 'mrpack' : 'zip'}`), zip = new ZipFile()
    if (provider === 'modrinth') zip.addBuffer(Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', versionId: String(version), name: 'Pack update QA', files: version === 2 ? [{ path: 'config/extra.bin', hashes: { sha1: extraHash }, downloads: [`${base}/extra.bin`], fileSize: extra.length }] : [], dependencies: { minecraft: '1.21.1', 'fabric-loader': version === 1 ? '0.16.0' : '0.16.1' } })), 'modrinth.index.json')
    else zip.addBuffer(Buffer.from(JSON.stringify({ minecraft: { version: '1.21.1', modLoaders: [{ id: version === 1 ? 'forge-52.0.0' : 'forge-52.0.1', primary: true }] }, manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Pack update QA', version: String(version), files: [], overrides: 'overrides' })), 'manifest.json')
    zip.addBuffer(Buffer.from(version === 1 ? 'OLD PACK' : 'NEW PACK'), 'overrides/config/pack.txt')
    if (version === 1) zip.addBuffer(Buffer.from('OLD ONLY'), 'overrides/config/old.txt')
    else {
      zip.addBuffer(Buffer.from('NEW ONLY'), 'overrides/config/new.txt')
      zip.addBuffer(Buffer.from(JSON.stringify({ java: 'C:/evil/java.exe', vmOptions: ['-javaagent:remote.jar'], preExecuteCommand: 'DO NOT EXECUTE', maxMemory: 999999 })), 'xmcl.json')
      if (worldChanges) zip.addBuffer(Buffer.from('REPLACE WORLD'), 'overrides/saves/Existing/level.dat')
    }
    zip.end(); await pipeline(zip.outputStream, createWriteStream(path))
    const bytes = await readFile(path); assets.push({ provider, version, bytes, path, hash: createHash('sha1').update(bytes).digest('hex') })
  }
  async function seed(provider: 'modrinth' | 'curseforge') {
    const original = assets.find(asset => asset.provider === provider && asset.version === 1)!
    const upstream = provider === 'modrinth' ? { type: 'modrinth-modpack', projectId: 'AAAA0001', versionId: 'VVVV0001' } : { type: 'curseforge-modpack', modId: 1, fileId: 101 }
    const result = await launcher.main.evaluate(async ({ path, upstream }) => (window as any).serviceChannels.open('ModpackService').call('importModpack', path, undefined, upstream), { path: original.path, upstream })
    return result.instancePath as string
  }
  return { ...fixture, state, network: fixture.state, extra, seed }
}
