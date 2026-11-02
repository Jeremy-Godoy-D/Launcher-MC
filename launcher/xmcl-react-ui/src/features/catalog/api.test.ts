import { afterEach, expect, it, vi } from 'vitest'
import { getCatalogDetail, getCatalogVersions, getRequiredModrinthVersions, readCatalogQuery, safeCatalogImage, searchCatalog } from './api'
import type { ProjectVersion } from '@xmcl/modrinth'

afterEach(() => vi.unstubAllGlobals())
it('bounds shareable search state and refuses filter injection and invalid pagination', () => {
  expect(readCatalogQuery(new URLSearchParams('source=other&kind=other&loader=../../x&minecraft=1.21%22%5D&page=-1&sort=invalid'))).toEqual({ provider: 'modrinth', kind: 'modpack', loader: '', minecraft: '', page: 0, sort: 'relevance', text: '' })
  expect(readCatalogQuery(new URLSearchParams({ q: ' x'.repeat(400), page: '99999999999999999999' })).text.length).toBe(256)
})
it.each(['javascript:alert(1)', 'file:///private', 'data:image/svg+xml,x', 'https://user:secret@example.com/x', 'http://example.com/x'])('refuses unsafe remote image %s', value => expect(safeCatalogImage(value)).toBe(''))
it('preserves HTTPS provider images', () => expect(safeCatalogImage('https://cdn.modrinth.com/x.png')).toBe('https://cdn.modrinth.com/x.png'))
it('uses the installed Modrinth client with bounded paging, facets and cancellation', async () => {
  const fetch = vi.fn(async () => Response.json({ hits: [], total_hits: 0 })); vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  await searchCatalog(readCatalogQuery(new URLSearchParams('kind=mod&loader=fabric&minecraft=1.21.1&page=2&q=test')), signal)
  const [input, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
  expect(input.pathname).toBe('/v2/search'); expect(input.searchParams.get('offset')).toBe('48'); expect(input.searchParams.get('limit')).toBe('24')
  expect(JSON.parse(input.searchParams.get('facets')!)).toEqual([['project_type:mod'], ['versions:1.21.1'], ['categories:fabric']]); expect(init.signal).toBe(signal)
})
it('uses the existing CurseForge client without any renderer API key', async () => {
  const fetch = vi.fn(async () => Response.json({ data: [], pagination: { totalCount: 0 } })); vi.stubGlobal('fetch', fetch)
  await searchCatalog(readCatalogQuery(new URLSearchParams('source=curseforge&kind=shader&page=1')))
  const [input, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
  expect(input.hostname).toBe('api.curseforge.com'); expect(input.searchParams.get('classId')).toBe('6552'); expect(input.searchParams.get('index')).toBe('24'); expect(new Headers(init.headers).has('x-api-key')).toBe(false)
})
it.each(['modrinth', 'curseforge'])('applies the selected loader to modpack searches on %s', async provider => {
  const fetch = vi.fn(async () => Response.json(provider === 'modrinth' ? { hits: [], total_hits: 0 } : { data: [], pagination: { totalCount: 0 } })); vi.stubGlobal('fetch', fetch)
  await searchCatalog(readCatalogQuery(new URLSearchParams(`source=${provider}&kind=modpack&loader=fabric`)))
  const [url] = fetch.mock.calls[0] as unknown as [URL]
  if (provider === 'modrinth') expect(JSON.parse(url.searchParams.get('facets')!)).toContainEqual(['categories:fabric'])
  else { expect(url.searchParams.get('classId')).toBe('4471'); expect(url.searchParams.get('modLoaderType')).toBe('4') }
})
it('rejects malformed provider responses and avoids unsupported world requests', async () => {
  const fetch = vi.fn(async () => Response.json({ hits: {}, total_hits: 0 })); vi.stubGlobal('fetch', fetch)
  await expect(searchCatalog(readCatalogQuery(new URLSearchParams()))).rejects.toThrow('Invalid catalog response')
  fetch.mockClear(); expect(await searchCatalog(readCatalogQuery(new URLSearchParams('kind=world')))).toEqual({ projects: [], total: 0 }); expect(fetch).not.toHaveBeenCalled()
})
it('rejects route traversal before fetching project details', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  for (const id of ['../private', 'secret/path', 'https://example.test']) await expect(getCatalogDetail('modrinth', id)).rejects.toThrow('Invalid project identifier')
  await expect(getCatalogDetail('curseforge', '9007199254740992')).rejects.toThrow('Invalid project identifier'); expect(fetch).not.toHaveBeenCalled()
})
it('rejects malformed or cross-project version lists before rendering them', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ id: 'VVVV0001', project_id: 'AAAAAAAA', name: 'Missing metadata' }])))
  await expect(getCatalogVersions('modrinth', 'AAAAAAAA', '', '')).rejects.toThrow('Invalid catalog response')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id: 2, modId: 999, gameId: 432 }], pagination: { totalCount: 1 } })))
  await expect(getCatalogVersions('curseforge', '1', '', '')).rejects.toThrow('Invalid catalog response')
})
it('bounds version pagination before sending a request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  for (const page of [-1, 200, 1.5]) await expect(getCatalogVersions('modrinth', 'AAAAAAAA', '', '', page)).rejects.toThrow('Invalid version page')
  expect(fetch).not.toHaveBeenCalled()
})
const version = (id: string, dependencies: ProjectVersion['dependencies'] = []) => ({ id, project_id: id, game_versions: ['1.21.1'], loaders: ['fabric'], dependencies }) as ProjectVersion
it('resolves required versions once, tolerates cycles and leaves optional dependencies out', async () => {
  const a = version('AAAAAAAA', [{ version_id: 'BBBBBBBB', project_id: 'BBBBBBBB', dependency_type: 'required' }, { version_id: 'CCCCCCCC', project_id: 'CCCCCCCC', dependency_type: 'optional' }])
  const b = version('BBBBBBBB', [{ version_id: 'AAAAAAAA', project_id: 'AAAAAAAA', dependency_type: 'required' }])
  const fetch = vi.fn(async (input: unknown) => Response.json(String(input).endsWith('BBBBBBBB') ? b : a)); vi.stubGlobal('fetch', fetch)
  expect((await getRequiredModrinthVersions(a, '1.21.1', 'fabric')).map(file => file.id)).toEqual(['BBBBBBBB', 'AAAAAAAA'])
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects incompatible or unidentifiable required versions before installation', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  await expect(getRequiredModrinthVersions(version('AAAAAAAA'), '1.20.1', 'fabric')).rejects.toThrow('incompatible')
  await expect(getRequiredModrinthVersions(version('AAAAAAAA', [{ version_id: '../x', project_id: 'BBBBBBBB', dependency_type: 'required' }]), '1.21.1', 'fabric')).rejects.toThrow('Invalid project identifier')
  expect(fetch).not.toHaveBeenCalled()
})
