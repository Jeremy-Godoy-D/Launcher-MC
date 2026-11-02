import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import type { LauncherFixture } from '../fixtures/launcher'

export const catalogImage = 'https://cdn.modrinth.com/catalog-qa.png'
export const catalogBody = '<h2>Contenido seguro</h2><p>Descripción del creador.</p><script>window.__catalogPwned=1</script><img src="x" onerror="window.__catalogPwned=2"><img src="data:image/svg+xml,unsafe"><iframe src="https://untrusted.example.test"></iframe><svg onload="window.__catalogPwned=3"></svg><form><input name="private"></form><a href="javascript:alert(1)">Unsafe</a><a href="file:///private">Private</a><a href="https://modrinth.com/project/AAAA0001">Source</a><div style="position:fixed;inset:0">Texto normal</div>'
export function modrinthHit(index: number, type = 'modpack', query = '') {
  return { project_id: `AAAA${String(index).padStart(4, '0')}`, project_type: type, slug: `project-${index}`, title: query ? `${query} ${index}` : `Proyecto de prueba ${index}`, description: 'Contenido del proveedor para comprobar compatibilidad y navegación.', author: 'Autor del proyecto', downloads: 123456, icon_url: catalogImage, featured_gallery: catalogImage, gallery: [catalogImage], versions: ['1.21.1'], categories: ['fabric'] }
}
export function curseforgeMod(index = 1) {
  return { id: index, gameId: 432, classId: 6, name: `Proyecto CurseForge ${index}`, summary: 'Descripción proporcionada por su creador.', authors: [{ name: 'Autor CF' }], downloadCount: 150000, logo: { thumbnailUrl: catalogImage, url: catalogImage }, screenshots: [{ modId: index, url: catalogImage }], links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/project-${index}` } }
}
export async function mockReactCatalog(launcher: LauncherFixture) {
  const image = await readFile(resolve('..', 'branding/copper/app-64.png'))
  const state = { mode: 'normal' as 'normal' | 'races' | 'errors', phase: 0, slowStarted: false, slowAborted: false, release: () => {}, requests: [] as { url: string; key: boolean; authorization: boolean; cancellationId: boolean }[] }
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture')
    if (url.pathname === '/image') { response.writeHead(200, { 'content-type': 'image/png' }); response.end(image); return }
    state.requests.push({ url: url.pathname + url.search, key: !!request.headers['x-api-key'], authorization: !!request.headers.authorization, cancellationId: !!request.headers['x-grimo-catalog-request'] })
    const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => { response.writeHead(status, { 'content-type': 'application/json', ...headers }); response.end(JSON.stringify(value)) }
    const project = /^\/modrinth\/v2\/project\/([^/]+)/.exec(url.pathname)?.[1] || 'AAAA0001'
    if (url.pathname === '/modrinth/v2/search') {
      const query = url.searchParams.get('query') || ''
      if (state.mode === 'races') {
        if (query === 'slow') {
          state.slowStarted = true
          response.once('close', () => { if (!response.writableEnded) state.slowAborted = true })
          state.release = () => { if (!response.destroyed) json({ hits: [modrinthHit(1, 'mod', 'stale')], total_hits: 1 }) }
          return
        }
        if (query === 'quota') { json({}, 429, { 'retry-after': '120' }); return }
        json({ hits: [modrinthHit(1, 'mod', query || 'initial')], total_hits: 1 }); return
      }
      if (state.mode === 'errors') {
        if (state.phase === 0) json({ secret: 'REMOTE_PRIVATE_ERROR' }, 403)
        else if (state.phase === 1) json({ hits: {}, total_hits: 1 })
        else json({ hits: [], total_hits: 0 })
        return
      }
      const start = Number(url.searchParams.get('offset') || 0), type = JSON.parse(url.searchParams.get('facets') || '[]')[0]?.[0]?.split(':')[1] || 'modpack'
      json({ hits: Array.from({ length: 24 }, (_, index) => modrinthHit(start + index + 1, type, query)), total_hits: 48, offset: start, limit: 24 }); return
    }
    if (url.pathname.startsWith('/modrinth/')) {
      if (url.pathname.endsWith('/version')) json([{ id: 'VVVV0001', project_id: project, name: 'Versión compatible 1.0', version_number: '1.0', game_versions: ['1.21.1'], loaders: ['fabric'], version_type: 'release', date_published: '2026-10-30T12:00:00Z', dependencies: [], files: [] }])
      else json({ id: project, title: `Proyecto ${project}`, project_type: 'mod', body: `**Markdown seguro**\n\n${catalogBody}`, description: 'Descripción del proyecto para esta ficha.', downloads: 123456, icon_url: catalogImage, gallery: [{ url: catalogImage, featured: true }] })
      return
    }
    const id = Number(/^\/curseforge\/v1\/mods\/(\d+)/.exec(url.pathname)?.[1] || 1)
    if (url.pathname === '/curseforge/v1/mods/search') json({ data: Array.from({ length: 24 }, (_, index) => curseforgeMod(Number(url.searchParams.get('index') || 0) + index + 1)), pagination: { totalCount: 48 } })
    else if (url.pathname.endsWith('/description')) json({ data: catalogBody })
    else if (url.pathname.endsWith('/files')) json({ data: [{ id: 101, modId: id, gameId: 432, displayName: 'Versión CF compatible', fileName: 'catalog.jar', fileDate: '2026-10-30T12:00:00Z', gameVersions: ['1.21.1', 'Fabric'], releaseType: 1, dependencies: [] }], pagination: { totalCount: 1 } })
    else json({ data: curseforgeMod(id) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing catalog fixture server')
  // Same native HTTP redirect used by spec86; clients, protocol/proxy handling and response parsing remain real.
  await launcher.app.evaluate(({ session }, base) => {
    ;(globalThis as any).__catalogNativeHops = []
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://api.modrinth.com/v2/*', 'https://*/v1/mods*', 'https://cdn.modrinth.com/catalog-qa.png'] }, (details: { url: string; webContentsId?: number }, callback: (response: { redirectURL?: string }) => void) => {
      // Let the renderer reach its real protocol/proxy handler; redirect only the main-process HTTP hop.
      if (details.webContentsId && details.webContentsId > 0) { callback({}); return }
      const url = new URL(details.url), path = url.pathname === '/catalog-qa.png' ? '/image' : `${url.pathname.startsWith('/v1/') ? '/curseforge' : '/modrinth'}${url.pathname}${url.search}`
      if (url.pathname.startsWith('/v1/')) (globalThis as any).__catalogNativeHops.push({ provider: 'curseforge', usedProxy: url.hostname !== 'api.curseforge.com' })
      callback({ redirectURL: base + path })
    })
  }, `http://127.0.0.1:${address.port}`)
  return { state, hops: () => launcher.app.evaluate(() => (globalThis as any).__catalogNativeHops as { provider: string; usedProxy: boolean }[]), close: async () => {
    await launcher.app.evaluate(({ session }) => { session.defaultSession.webRequest.onBeforeRequest(null) })
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  } }
}
