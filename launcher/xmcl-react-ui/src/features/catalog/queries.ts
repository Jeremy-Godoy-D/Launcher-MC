import { QueryClient } from '@tanstack/react-query'
import { isCatalogMetadataRead } from '@xmcl/runtime-api/src/util/catalogMetadata'

// Cache public metadata only; runtime inventory and account data stay in their existing stores.
export const catalogQueries = new QueryClient({ defaultOptions: { queries: {
  staleTime: 120000, gcTime: 300000, refetchOnWindowFocus: false,
  retry: (count, error) => count < 2 && (error instanceof TypeError || 'status' in error && Number(error.status) >= 500),
} } })

const cooldowns = new Map<string, number>()
export const publicMetadataFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input)), origin = url.origin
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const until = cooldowns.get(origin) || 0
  if (until > Date.now()) throw Object.assign(new Error('Metadata rate limited'), { status: 429, retryAt: until })
  signal?.throwIfAborted()
  let request = init
  if (typeof window !== 'undefined' && window.serviceChannels && isCatalogMetadataRead(url, init?.method || (input instanceof Request ? input.method : 'GET'))) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'), headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-grimo-catalog-request', id)
    // This local protocol capability only cancels its own public read; it never reaches a provider or Worker.
    signal?.addEventListener('abort', () => { void fetch(`http://launcher/catalog-request/${id}`, { method: 'POST', cache: 'no-store' }).catch(() => {}) }, { once: true })
    request = { ...init, headers }
  }
  const response = await fetch(input, request)
  if (!response.ok) {
    let retryAt: number | undefined
    if (response.status === 429) {
      const header = response.headers.get('retry-after') || '60'
      const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()
      retryAt = Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 60000)
      cooldowns.set(origin, retryAt)
    }
    throw Object.assign(new Error('Public metadata request failed'), { status: response.status, retryAt })
  }
  return response
}

export function catalogError(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  return status === 429 ? 'limited' : status === 401 || status === 403 ? 'unauthorized' : status === 404 ? 'missing' : 'failed'
}
