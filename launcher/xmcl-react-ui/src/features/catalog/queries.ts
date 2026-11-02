import { QueryClient } from '@tanstack/react-query'

// Cache public metadata only; runtime inventory and account data stay in their existing stores.
export const catalogQueries = new QueryClient({ defaultOptions: { queries: {
  staleTime: 120000, gcTime: 300000, refetchOnWindowFocus: false,
  retry: (count, error) => count < 2 && (error instanceof TypeError || 'status' in error && Number(error.status) >= 500),
} } })

const cooldowns = new Map<string, number>()
export const publicMetadataFetch: typeof fetch = async (input, init) => {
  const origin = new URL(input instanceof Request ? input.url : String(input)).origin
  const until = cooldowns.get(origin) || 0
  if (until > Date.now()) throw Object.assign(new Error('Metadata rate limited'), { status: 429, retryAt: until })
  const response = await fetch(input, init)
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
