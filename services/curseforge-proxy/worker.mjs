const ORIGIN = 'https://api.curseforge.com'
const HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' }
const SEARCH = new Set(['gameId', 'classId', 'categoryId', 'gameVersion', 'searchFilter', 'sortField', 'sortOrder', 'modLoaderType', 'modLoaderTypes', 'gameVersionTypeId', 'index', 'pageSize', 'slug'])
const FILES = new Set(['gameVersion', 'modLoaderType', 'gameVersionTypeId', 'index', 'pageSize'])
function error(status, code, retry = false) { return new Response(JSON.stringify({ error: code }), { status, headers: { ...HEADERS, 'cache-control': 'no-store', ...(retry ? { 'retry-after': '60' } : {}) } }) }

export function validateRoute(request) {
  const url = new URL(request.url)
  if (url.search.length > 2048) return null
  const path = url.pathname
  let allowed
  let bodyKey
  if (request.method === 'GET') {
    if (path === '/v1/categories') allowed = new Set(['gameId'])
    else if (path === '/v1/mods/search') allowed = SEARCH
    else if (/^\/v1\/mods\/[1-9]\d{0,9}\/files$/.test(path)) allowed = FILES
    else if (/^\/v1\/mods\/[1-9]\d{0,9}(\/description|\/files\/[1-9]\d{0,9}(\/changelog|\/download-url)?)?$/.test(path)) allowed = new Set()
    else return null
  } else if (request.method === 'POST') {
    bodyKey = path === '/v1/mods' ? 'modIds' : path === '/v1/mods/files' ? 'fileIds' : /^\/v1\/fingerprints\/(fuzzy\/)?432$/.test(path) ? 'fingerprints' : undefined
    if (!bodyKey || !request.headers.get('content-type')?.startsWith('application/json')) return null
    allowed = new Set()
  } else return null
  const params = new URLSearchParams()
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || params.has(key)) return null
    if (!value) continue // The existing REST client emits empty optional file filters.
    if (value.length > (key === 'searchFilter' ? 128 : 80) || /[\x00-\x1f\x7f]/.test(value)) return null
    if (key === 'gameId' && value !== '432') return null
    if (['classId', 'categoryId', 'gameVersionTypeId', 'index', 'pageSize', 'sortField', 'modLoaderType'].includes(key) && !/^\d{1,10}$/.test(value)) return null
    if (key === 'sortOrder' && !['asc', 'desc'].includes(value)) return null
    if (key === 'modLoaderTypes') {
      try { const values = JSON.parse(value); if (!Array.isArray(values) || values.length > 7 || values.some(v => !Number.isInteger(v) || v < 0 || v > 6)) return null } catch { return null }
    }
    params.set(key, value)
  }
  if (params.has('modLoaderType') && Number(params.get('modLoaderType')) > 6) return null
  if (params.has('sortField') && Number(params.get('sortField')) > 12) return null
  const size = Number(params.get('pageSize') || 50)
  const index = Number(params.get('index') || 0)
  if (size < 1 || size > 50 || index + size > 10000) return null
  if (path === '/v1/categories' || path === '/v1/mods/search') params.set('gameId', '432')
  params.sort()
  const upstream = new URL(path, ORIGIN)
  upstream.search = params.toString()
  return { upstream, bodyKey }
}

async function readBounded(stream, limit) {
  if (!stream) return new Uint8Array()
  const reader = stream.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('body_limit') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function handleRequest(request, env, ctx, upstreamFetch = (url, options) => globalThis.fetch(url, options), cache = globalThis.caches?.default) {
  if (env.ENABLED !== 'true' || !env.CURSEFORGE_API_KEY || !env.CLIENT_LIMIT || !env.UPSTREAM_LIMIT) return error(503, 'catalog_unavailable')
  if (typeof env.CURSEFORGE_API_KEY !== 'string' || /[\x00-\x20\x7f-\uffff]/.test(env.CURSEFORGE_API_KEY)) return error(503, 'catalog_configuration_error')
  const preflightMethod = request.headers.get('access-control-request-method')
  if (request.method === 'OPTIONS' && !['GET', 'POST'].includes(preflightMethod)) return error(400, 'invalid_request')
  const route = validateRoute(request.method === 'OPTIONS' ? new Request(request.url, { method: preflightMethod, headers: { 'content-type': 'application/json' } }) : request)
  if (!route) return error(400, 'invalid_request')
  const ip = request.headers.get('cf-connecting-ip')
  // This header is supplied by Cloudflare. Fail closed outside the edge runtime.
  if (!ip) return error(503, 'catalog_unavailable')
  try {
    if (!(await env.CLIENT_LIMIT.limit({ key: ip })).success) return error(429, 'rate_limited', true)
  } catch { return error(503, 'catalog_unavailable') }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...HEADERS, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept', 'access-control-max-age': '600' } })
  let body
  if (route.bodyKey) {
    try {
      const bytes = await readBounded(request.body, 32768)
      const parsed = JSON.parse(new TextDecoder().decode(bytes))
      const values = parsed[route.bodyKey]
      if (Object.keys(parsed).length !== 1 || !Array.isArray(values) || values.length < 1 || values.length > 1000 || values.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 0xffffffff)) return error(400, 'invalid_request')
      body = JSON.stringify({ [route.bodyKey]: values })
    } catch { return error(400, 'invalid_request') }
  }
  const cacheKey = new Request(new URL(route.upstream.pathname + route.upstream.search, request.url), { method: 'GET' })
  if (request.method === 'GET' && cache) {
    try { const cached = await cache.match(cacheKey); if (cached) return cached } catch { /* Cache outages must not bypass upstream limits. */ }
  }
  try {
    if (!(await env.UPSTREAM_LIMIT.limit({ key: 'curseforge' })).success) return error(429, 'catalog_busy', true)
  } catch { return error(503, 'catalog_unavailable') }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const upstream = await upstreamFetch(route.upstream, {
      method: request.method, redirect: 'manual', signal: controller.signal, body,
      headers: { 'x-api-key': env.CURSEFORGE_API_KEY, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    })
    if (upstream.status !== 200) {
      await upstream.body?.cancel()
      if (upstream.status === 401 || upstream.status === 403) return error(503, 'catalog_configuration_error')
      return error(upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : 502, upstream.status === 404 ? 'project_not_found' : 'catalog_unavailable_' + upstream.status, upstream.status === 429)
    }
    const bytes = await readBounded(upstream.body, 4 * 1024 * 1024)
    let data
    try { data = JSON.parse(new TextDecoder().decode(bytes)) } catch { return error(502, 'invalid_upstream') }
    if (!data || !Object.hasOwn(data, 'data')) return error(502, 'invalid_upstream')
    const records = Array.isArray(data.data) ? data.data : [data.data]
    if (records.some(record => record && typeof record === 'object' && record.gameId !== undefined && record.gameId !== 432)) return error(404, 'project_not_found')
    const response = new Response(bytes, { headers: { ...HEADERS, 'cache-control': request.method === 'GET' ? 'public, max-age=' + (route.upstream.pathname === '/v1/mods/search' ? 60 : 300) : 'no-store' } })
    if (request.method === 'GET' && cache) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}))
    return response
  } catch { return error(controller.signal.aborted ? 504 : 502, 'catalog_unavailable') }
  finally { clearTimeout(timer) }
}

export default { fetch: (request, env, ctx) => handleRequest(request, env, ctx) }
