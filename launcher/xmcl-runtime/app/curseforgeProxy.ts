import { CurseforgeV1Client } from '@xmcl/curseforge'

export function getCurseforgeProxyUrl(source: URL): URL {
  const proxy = new URL(process.env.CURSEFORGE_PROXY_URL || '')
  if (source.origin !== 'https://api.curseforge.com' || proxy.protocol !== 'https:' || proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash || proxy.hostname === 'api.curseforge.com') throw new Error('invalid_proxy')
  const target = new URL(proxy.origin)
  target.pathname = source.pathname
  target.search = source.search
  return target
}

export function createCurseforgeProxyClient(fetch: typeof globalThis.fetch): CurseforgeV1Client {
  return new CurseforgeV1Client('', {
    fetch: async (input, init) => {
      let target: URL
      try {
        target = getCurseforgeProxyUrl(new URL(input instanceof Request ? input.url : input.toString()))
      } catch {
        return Response.json({ error: 'catalog_unavailable' }, { status: 503 })
      }
      const headers = new Headers(init?.headers)
      for (const name of ['x-api-key', 'authorization', 'cookie']) headers.delete(name)
      return fetch(target, { ...init, headers })
    },
  })
}
