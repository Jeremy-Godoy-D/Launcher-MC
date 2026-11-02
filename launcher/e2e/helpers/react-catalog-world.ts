import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { LauncherFixture } from '../fixtures/launcher'
import { makeReactWorld } from './react-world'
import { catalogImage, mockReactCatalog } from './react-catalog'

export async function mockWorldCatalog(launcher: LauncherFixture) {
  const source = await makeReactWorld(join(launcher.appDataPath, 'catalog-world-source'), 'Original', 'Catalog world')
  const level = await readFile(join(source, 'level.dat')), archive = join(launcher.appDataPath, 'catalog-world.zip')
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  zip.addBuffer(level, 'wrapped/level.dat'); zip.addBuffer(Buffer.from('WORLD MARKER'), 'wrapped/marker.txt'); zip.end()
  await pipeline(zip.outputStream, createWriteStream(archive))
  const bytes = await readFile(archive), hash = createHash('sha1').update(bytes).digest('hex')
  const state = { slow: false, corrupt: false, requested: false, aborted: false, downloads: 0, release: () => {} }
  let base = ''
  const project = { id: 1, gameId: 432, classId: 17, name: 'World: QA / Archive', summary: 'Owned world fixture', authors: [{ name: 'QA' }], downloadCount: 1, logo: { url: catalogImage }, screenshots: [], links: { websiteUrl: 'https://www.curseforge.com/minecraft/worlds/qa' } }
  const file = () => ({ id: 101, modId: 1, gameId: 432, displayName: 'World release', fileName: 'world.zip', fileDate: '2026-11-02T00:00:00Z', releaseType: 1, isAvailable: true, downloadUrl: `${base}/world.zip`, fileLength: bytes.length, hashes: [{ algo: 1, value: state.corrupt ? '0'.repeat(40) : hash }], gameVersions: ['1.21.1'], dependencies: [] })
  const fixture = await mockReactCatalog(launcher, undefined, (url, _request, response) => {
    const json = (value: unknown) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (url.pathname === '/world.zip') {
      state.requested = true; state.downloads++
      response.writeHead(200, { 'content-type': 'application/zip', 'content-length': bytes.length })
      if (state.slow) { response.write(bytes.subarray(0, 64)); response.once('close', () => { if (!response.writableEnded) state.aborted = true }); state.release = () => { if (!response.destroyed) response.end(bytes.subarray(64)) } }
      else response.end(bytes)
    } else if (url.pathname === '/curseforge/v1/mods/search') json({ data: [project], pagination: { totalCount: 1 } })
    else if (url.pathname === '/curseforge/v1/mods/1') json({ data: project })
    else if (url.pathname === '/curseforge/v1/mods/1/description') json({ data: '<p>Owned world description</p>' })
    else if (url.pathname === '/curseforge/v1/mods/1/files' || url.pathname === '/curseforge/v1/mods/files') json({ data: [file()], pagination: { totalCount: 1 } })
    else return false
    return true
  })
  base = fixture.base
  return { ...fixture, world: state, source, level, bytes }
}
