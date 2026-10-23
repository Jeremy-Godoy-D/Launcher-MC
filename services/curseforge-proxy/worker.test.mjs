import test from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest, validateRoute } from './worker.mjs'

const ctx = { waitUntil: promise => promise }
const configured = () => ({ ENABLED: 'true', CURSEFORGE_API_KEY: 'test-only-secret', CLIENT_LIMIT: { limit: async () => ({ success: true }) }, UPSTREAM_LIMIT: { limit: async () => ({ success: true }) } })
const request = (path = '/v1/mods/search', options = {}) => new Request('https://proxy.example.test' + path, { ...options, headers: { 'cf-connecting-ip': '192.0.2.1', ...options.headers } })

test('unconfigured, disabled and missing limiter fail closed without upstream calls', async () => {
  for (const env of [{}, { ...configured(), ENABLED: 'false' }, { ...configured(), CLIENT_LIMIT: undefined }]) {
    const response = await handleRequest(request(), env, ctx, () => assert.fail('must not reach upstream'))
    assert.equal(response.status, 503)
  }
})
test('only known API paths, methods and bounded filters are accepted', () => {
  for (const path of ['/v1/games', '/v1/mods/search?url=https://evil.test', '/v1/mods/search?gameId=1', '/v1/mods/search?pageSize=51', '/v1/mods/search?index=9999&pageSize=50', '/v1/mods/search?index=0&index=1', '/v1/mods/search?searchFilter=' + 'x'.repeat(129)]) assert.equal(validateRoute(request(path)), null)
  assert.equal(validateRoute(request('/v1/mods/123', { method: 'DELETE' })), null)
  const route = validateRoute(request('/v1/mods/123/files?index=&pageSize=&gameVersion='))
  assert.equal(route.upstream.href, 'https://api.curseforge.com/v1/mods/123/files')
})
test('server secret replaces all untrusted credentials and target is fixed', async () => {
  let seen
  const response = await handleRequest(request('/v1/mods/search?searchFilter=test', { headers: { 'x-api-key': 'forged', Authorization: 'private' } }), configured(), ctx, async (url, options) => {
    seen = { url, options }
    return Response.json({ data: [], pagination: { totalCount: 0 } })
  })
  assert.equal(response.status, 200)
  assert.equal(seen.url.origin, 'https://api.curseforge.com')
  assert.equal(seen.url.searchParams.get('gameId'), '432')
  assert.equal(seen.options.headers['x-api-key'], 'test-only-secret')
  assert.equal(seen.options.headers.Authorization, undefined)
  assert.equal(response.headers.get('x-api-key'), null)
  assert.equal(seen.options.redirect, 'manual')
})
test('rate limit blocks even cached requests and upstream budget blocks misses', async () => {
  for (const key of ['CLIENT_LIMIT', 'UPSTREAM_LIMIT']) {
    const env = configured(); env[key] = { limit: async () => ({ success: false }) }
    const response = await handleRequest(request(), env, ctx, () => assert.fail('must not reach upstream'))
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '60')
  }
})
test('bulk reads validate keys, array lengths, body size and integer IDs', async () => {
  for (const body of [{ fileIds: [] }, { fileIds: ['1'] }, { fileIds: [1], url: 'https://evil' }, { fileIds: Array(1001).fill(1) }]) {
    const response = await handleRequest(request('/v1/mods/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), configured(), ctx, () => assert.fail('must not reach upstream'))
    assert.equal(response.status, 400)
  }
  const good = await handleRequest(request('/v1/mods/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileIds: [1, 2] }) }), configured(), ctx, async () => Response.json({ data: [] }))
  assert.equal(good.status, 200)
})
test('supports constrained POST preflight without exposing a key', async () => {
  const response = await handleRequest(request('/v1/mods/files', { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } }), configured(), ctx, () => assert.fail('preflight must not reach upstream'))
  assert.equal(response.status, 204)
})
test('upstream errors are sanitized and never echo upstream bodies or headers', async () => {
  for (const status of [401, 403, 429, 500]) {
    const response = await handleRequest(request(), configured(), ctx, async () => new Response('test-only-secret', { status, headers: { 'x-api-key': 'test-only-secret' } }))
    assert.equal(response.status, status === 401 || status === 403 ? 503 : status === 429 ? 429 : 502)
    assert.equal((await response.text()).includes('test-only-secret'), false)
    assert.equal(response.headers.get('x-api-key'), null)
  }
})

test('redirects are rejected without forwarding the secret to their destination', async () => {
  let calls = 0
  const response = await handleRequest(request(), configured(), ctx, async (_url, options) => {
    calls++
    assert.equal(options.redirect, 'manual')
    return new Response(null, { status: 302, headers: { location: 'https://untrusted.example/' } })
  })
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('location'), null)
  assert.equal(calls, 1)
})

test('malformed secrets fail before constructing upstream headers', async () => {
  const response = await handleRequest(request(), { ...configured(), CURSEFORGE_API_KEY: 'invalid\nvalue' }, ctx, () => assert.fail('must not reach upstream'))
  assert.equal(response.status, 503)
})
test('aborted upstream becomes recoverable timeout', async () => {
  const response = await handleRequest(request(), configured(), ctx, async () => { throw new Error('network failure') })
  assert.equal(response.status, 502)
})
test('other games and oversized upstream responses are rejected', async () => {
  const response = await handleRequest(request('/v1/mods/1'), configured(), ctx, async () => Response.json({ data: { gameId: 1 } }))
  assert.equal(response.status, 404)
  const large = await handleRequest(request(), configured(), ctx, async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)))
  assert.equal(large.status, 502)
})
test('public cache avoids another upstream call', async () => {
  let saved
  const cache = { match: async () => saved?.clone(), put: async (_key, value) => { saved = value } }
  const first = await handleRequest(request(), configured(), ctx, async () => Response.json({ data: [] }), cache)
  assert.equal(first.status, 200)
  const second = await handleRequest(request(), configured(), ctx, () => assert.fail('cache miss'), cache)
  assert.equal(second.status, 200)
})
