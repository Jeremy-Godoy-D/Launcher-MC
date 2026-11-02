import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

export const catalogImage = 'https://cdn.modrinth.com/catalog-qa.png'
export const catalogBody = '<h2>Contenido seguro</h2><p>Descripción del creador.</p><script>window.__catalogPwned=1</script><img src="x" onerror="window.__catalogPwned=2"><img src="data:image/svg+xml,unsafe"><iframe src="https://untrusted.example.test"></iframe><svg onload="window.__catalogPwned=3"></svg><form><input name="private"></form><a href="javascript:alert(1)">Unsafe</a><a href="file:///private">Private</a><a href="https://modrinth.com/project/AAAA0001">Source</a><div style="position:fixed;inset:0">Texto normal</div>'
export function modrinthHit(index: number, type = 'modpack', query = '') {
  return { project_id: `AAAA${String(index).padStart(4, '0')}`, project_type: type, slug: `project-${index}`, title: query ? `${query} ${index}` : `Proyecto de prueba ${index}`, description: 'Contenido del proveedor para comprobar compatibilidad y navegación.', author: 'Autor del proyecto', downloads: 123456, icon_url: catalogImage, featured_gallery: catalogImage, gallery: [catalogImage], versions: ['1.21.1'], categories: ['fabric'] }
}
export function curseforgeMod(index = 1) {
  return { id: index, gameId: 432, classId: 6, name: `Proyecto CurseForge ${index}`, summary: 'Descripción proporcionada por su creador.', authors: [{ name: 'Autor CF' }], downloadCount: 150000, logo: { thumbnailUrl: catalogImage, url: catalogImage }, screenshots: [{ modId: index, url: catalogImage }], links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/project-${index}` } }
}
export async function mockReactCatalog(page: Page) {
  const image = await readFile(resolve('..', 'branding/copper/app-64.png'))
  await page.route(catalogImage, route => route.fulfill({ contentType: 'image/png', body: image }))
  await page.route(/https:\/\/api\.modrinth\.com\/v2\/(search|project\/[^/?]+(?:\/version)?)(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url()), project = /^\/v2\/project\/([^/]+)/.exec(url.pathname)?.[1] || 'AAAA0001'
    if (url.pathname === '/v2/search') {
      const start = Number(url.searchParams.get('offset') || 0), type = JSON.parse(url.searchParams.get('facets') || '[]')[0]?.[0]?.split(':')[1] || 'modpack'
      await route.fulfill({ json: { hits: Array.from({ length: 24 }, (_, index) => modrinthHit(start + index + 1, type, url.searchParams.get('query') || '')), total_hits: 48, offset: start, limit: 24 } })
    } else if (url.pathname.endsWith('/version')) {
      await route.fulfill({ json: [{ id: 'VVVV0001', project_id: project, name: 'Versión compatible 1.0', version_number: '1.0', game_versions: ['1.21.1'], loaders: ['fabric'], version_type: 'release', date_published: '2026-10-30T12:00:00Z', dependencies: [], files: [] }] })
    } else await route.fulfill({ json: { id: project, title: `Proyecto ${project}`, project_type: 'mod', body: `**Markdown seguro**\n\n${catalogBody}`, description: 'Descripción del proyecto para esta ficha.', downloads: 123456, icon_url: catalogImage, gallery: [{ url: catalogImage, featured: true }] } })
  })
  await page.route(/https:\/\/api\.curseforge\.com\/v1\/mods(?:\?.*|\/.*)?$/, async route => {
    const url = new URL(route.request().url()), id = Number(/^\/v1\/mods\/(\d+)/.exec(url.pathname)?.[1] || 1)
    if (url.pathname === '/v1/mods/search') await route.fulfill({ json: { data: Array.from({ length: 24 }, (_, index) => curseforgeMod(Number(url.searchParams.get('index') || 0) + index + 1)), pagination: { totalCount: 48 } } })
    else if (url.pathname.endsWith('/description')) await route.fulfill({ json: { data: catalogBody } })
    else if (url.pathname.endsWith('/files')) await route.fulfill({ json: { data: [{ id: 101, modId: id, gameId: 432, displayName: 'Versión CF compatible', fileName: 'catalog.jar', fileDate: '2026-10-30T12:00:00Z', gameVersions: ['1.21.1', 'Fabric'], releaseType: 1, dependencies: [] }], pagination: { totalCount: 1 } } })
    else await route.fulfill({ json: { data: curseforgeMod(id) } })
  })
}
