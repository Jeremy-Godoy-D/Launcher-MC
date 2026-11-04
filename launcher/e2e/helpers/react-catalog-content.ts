import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LauncherFixture } from '../fixtures/launcher'
import { mockReactCatalog, catalogImage } from './react-catalog'
import { makeReactMod, makeReactResourcePack, makeReactShaderPack } from './react-content'

export async function mockCatalogContent(launcher: LauncherFixture, kind: 'mod' | 'resourcepack' | 'shader' = 'mod', crossKind = false) {
  const definitions = [
    { key: 'root1', project: 'AAAA0001', version: 'VVVV0001', modId: 1, fileId: 101, artifact: 'catalog_root', number: '1.0.0' },
    { key: 'root2', project: 'AAAA0001', version: 'VVVV0002', modId: 1, fileId: 102, artifact: 'catalog_root', number: '2.0.0' },
    { key: 'dependency', project: 'BBBB0001', version: 'DEPV0001', modId: 2, fileId: 201, artifact: 'catalog_dependency', number: '1.0.0' },
    { key: 'optional', project: 'OOOO0001', version: 'OPTV0001', modId: 3, fileId: 301, artifact: 'catalog_optional', number: '1.0.0' },
  ]
  const assets = await Promise.all(definitions.map(async definition => {
    const assetKind = crossKind && definition.key === 'dependency' ? 'resourcepack' : kind
    const filename = `${definition.key}.${assetKind === 'mod' ? 'jar' : 'zip'}`, path = join(launcher.appDataPath, assetKind === 'mod' ? 'mods' : assetKind === 'resourcepack' ? 'resourcepacks' : 'shaderpacks', filename)
    if (assetKind === 'mod') await makeReactMod(launcher.appDataPath, definition.key, `Catalog ${definition.key}`, { id: definition.artifact, version: definition.number })
    else if (assetKind === 'resourcepack') await makeReactResourcePack(launcher.appDataPath, definition.key, `${definition.key}-${definition.number}`)
    else await makeReactShaderPack(launcher.appDataPath, definition.key, definition.number)
    const bytes = await readFile(path)
    return { ...definition, kind: assetKind, filename, bytes, hash: createHash('sha1').update(bytes).digest('hex') }
  }))
  const state = { slowDependency: false, metadataSlow: false, metadataStarted: false, metadataAborted: false, transferStarted: false, transferAborted: false, transfers: [] as string[], release: () => {} }
  let base = ''
  type Asset = typeof assets[number]
  const mr = (asset: Asset) => ({ id: asset.version, project_id: asset.project, name: `Catalog ${asset.key} ${asset.number}`, version_number: asset.number, date_published: '2026-11-02T00:00:00Z', version_type: 'release', game_versions: ['1.21.1'], loaders: asset.kind === 'mod' ? ['fabric'] : asset.kind === 'shader' ? ['iris', 'optifine'] : ['minecraft'], dependencies: asset.modId === 1 ? [{ project_id: 'BBBB0001', version_id: null, dependency_type: 'required' }, { project_id: 'OOOO0001', version_id: null, dependency_type: 'optional' }] : [], files: [{ primary: true, filename: asset.filename, url: `${base}/content-file/${asset.key}`, size: asset.bytes.length, hashes: { sha1: asset.hash } }] })
  const cf = (asset: Asset) => ({ id: asset.fileId, modId: asset.modId, gameId: 432, fileName: asset.filename, displayName: `Catalog ${asset.key} ${asset.number}`, fileDate: '2026-11-02T00:00:00Z', releaseType: 1, isAvailable: true, downloadUrl: `${base}/content-file/${asset.key}`, fileLength: asset.bytes.length, hashes: [{ algo: 1, value: asset.hash }], gameVersions: ['1.21.1', ...(asset.kind === 'mod' ? ['Fabric'] : [])], dependencies: asset.modId === 1 ? [{ modId: 2, relationType: 3 }, { modId: 3, relationType: 2 }] : [] })
  const classId = { mod: 6, resourcepack: 12, shader: 6552 }[kind]
  const cfProject = (id: number) => ({ id, gameId: 432, classId: crossKind && id === 2 ? 12 : classId, name: `Catalog CF ${id}`, summary: 'Owned local catalog fixture', authors: [{ name: 'QA' }], downloadCount: 1, logo: { url: catalogImage, thumbnailUrl: catalogImage }, screenshots: [], links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/qa-${id}` } })
  const fixture = await mockReactCatalog(launcher, undefined, (url, request, response) => {
    const json = (value: unknown) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (url.pathname.startsWith('/content-file/')) {
      const asset = assets.find(asset => url.pathname.endsWith(`/${asset.key}`)); if (!asset) { response.writeHead(404); response.end(); return true }
      state.transferStarted = true; state.transfers.push(asset.key)
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': asset.bytes.length })
      if (state.slowDependency && asset.key === 'dependency') {
        response.once('close', () => { if (!response.writableEnded) state.transferAborted = true })
        response.write(asset.bytes.subarray(0, 64)); state.release = () => { if (!response.destroyed) response.end(asset.bytes.subarray(64)) }
      } else response.end(asset.bytes)
      return true
    }
    if (url.pathname === '/modrinth/v2/search') { json({ hits: [{ project_id: 'AAAA0001', project_type: kind, title: 'Catalog Root', description: 'Owned fixture', author: 'QA', downloads: 1, icon_url: catalogImage, gallery: [], versions: ['1.21.1'], categories: kind === 'mod' ? ['fabric'] : [] }], total_hits: 1 }); return true }
    if (url.pathname === '/curseforge/v1/mods/search') { json({ data: [cfProject(1)], pagination: { totalCount: 1 } }); return true }
    if (url.pathname === '/modrinth/v2/versions' || url.pathname === '/curseforge/v1/mods/files') {
      state.metadataStarted = true
      if (state.metadataSlow) { response.once('close', () => { if (!response.writableEnded) state.metadataAborted = true }); return true }
      if (url.pathname.startsWith('/modrinth')) json(assets.filter(asset => (JSON.parse(url.searchParams.get('ids') || '[]') as string[]).includes(asset.version)).map(mr))
      else {
        const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(Buffer.from(chunk)))
        request.on('end', () => { const ids = JSON.parse(Buffer.concat(chunks).toString()).fileIds as number[]; json({ data: assets.filter(asset => ids.includes(asset.fileId)).map(cf) }) })
      }
      return true
    }
    const mrVersion = /^\/modrinth\/v2\/version\/([^/]+)$/.exec(url.pathname)
    if (mrVersion) { const asset = assets.find(asset => asset.version === mrVersion[1]); if (asset) json(mr(asset)); else { response.writeHead(404); response.end() }; return true }
    const mrProject = /^\/modrinth\/v2\/project\/([^/]+)(\/version)?$/.exec(url.pathname)
    if (mrProject) {
      if (mrProject[2]) json(assets.filter(asset => asset.project === mrProject[1]).map(mr))
      else json({ id: mrProject[1], title: `Catalog ${mrProject[1]}`, project_type: crossKind && mrProject[1] === 'BBBB0001' ? 'resourcepack' : kind, client_side: 'required', description: 'Owned local fixture', body: 'Owned fixture description', downloads: 1, icon_url: catalogImage, gallery: [] })
      return true
    }
    if (url.pathname.startsWith('/modrinth/v2/version_files')) { json({}); return true }
    const cfMod = /^\/curseforge\/v1\/mods\/(\d+)(\/description|\/files)?$/.exec(url.pathname)
    if (cfMod) {
      if (cfMod[2] === '/description') json({ data: '<p>Owned fixture description</p>' })
      else if (cfMod[2] === '/files') { const list = assets.filter(asset => asset.modId === Number(cfMod[1])); json({ data: list.map(cf), pagination: { totalCount: list.length } }) }
      else json({ data: cfProject(Number(cfMod[1])) })
      return true
    }
    if (url.pathname.startsWith('/curseforge/v1/fingerprints')) { json({ data: { exactMatches: [], partialMatches: [], exactFingerprints: [], partialMatchFingerprints: [], unmatchedFingerprints: [] } }); return true }
    return false
  })
  base = fixture.base
  return { ...fixture, content: state, assets }
}
