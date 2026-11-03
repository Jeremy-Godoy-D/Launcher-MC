import { describe, expect, test, vi } from 'vitest'

const keys = vi.hoisted(() => ({
  flights: Symbol('kFlights'),
  accountService: Symbol('XmclAccountService'),
  authorization: Symbol('kXmclSessionAuthorization'),
}))

vi.mock('~/infra', () => ({ kFlights: keys.flights }))
vi.mock('~/xmclAccount/XmclAccountService', () => ({
  XmclAccountService: keys.accountService,
  kXmclSessionAuthorization: keys.authorization,
}))

const { pluginApiFallback } = await import('./pluginApiFallback')

function createPlugin(resolveAuthorization: () => Promise<unknown>) {
  const service = {
    [keys.authorization]: resolveAuthorization,
  }
  const app = {
    registry: {
      get: vi.fn(async (key: symbol) => (key === keys.flights ? {} : service)),
    },
    protocol: {
      registerHandler: vi.fn(),
    },
  }
  pluginApiFallback(app as any, {} as any)
  return {
    app,
    handler: app.protocol.registerHandler.mock.calls[0]![1],
  }
}

describe('pluginApiFallback', () => {
  test('retired XMCL endpoints fail locally without resolving credentials', async () => {
    for (const host of ['signaling.xmcl.app', 'xmcl.app', 'xmcl-core-api.azurewebsites.net']) {
      const { handler, app } = createPlugin(async () => { throw new Error('Credentials must stay inert') })
      const request = { method: 'POST', url: new URL(`https://${host}/v1/rtc/official`), headers: { Authorization: 'renderer-token', DPoP: 'renderer-proof', Cookie: 'private' } }
      const response: Record<string, any> = {}
      await handler({ request, response })
      expect(response).toMatchObject({ status: 410, handled: true })
      expect(request.headers).toEqual({}); expect(app.registry.get).not.toHaveBeenCalled()
    }
  })

  test('rejects unconfigured or unsafe proxy URLs locally', async () => {
    const previous = process.env.CURSEFORGE_PROXY_URL
    try {
      for (const value of ['', 'http://insecure.test', 'https://user:pass@proxy.test', 'https://api.curseforge.com', 'https://proxy.test/path']) {
        process.env.CURSEFORGE_PROXY_URL = value
        const { handler } = createPlugin(async () => undefined)
        const request = { method: 'GET', url: new URL('https://api.curseforge.com/v1/mods/search'), headers: { 'X-Api-Key': 'untrusted-key' } }
        const response: Record<string, any> = { headers: {} }
        await handler({ request, response })
        expect(response.status).toBe(503)
        expect(response.handled).toBe(true)
        expect(request.headers).toEqual({})
      }
    } finally {
      if (previous === undefined) delete process.env.CURSEFORGE_PROXY_URL
      else process.env.CURSEFORGE_PROXY_URL = previous
    }
  })

  test('rewrites API requests to the HTTPS proxy without sending client credentials', async () => {
    const previous = process.env.CURSEFORGE_PROXY_URL
    process.env.CURSEFORGE_PROXY_URL = 'https://catalog.example.test'
    try {
      const { handler } = createPlugin(async () => undefined)
      const request = { method: 'POST', url: new URL('https://api.curseforge.com/v1/mods?index=1'), headers: { 'X-API-Key': 'untrusted-key', Authorization: 'do-not-forward', Cookie: 'session=private', 'content-type': 'application/json' } }
      const response: Record<string, any> = { headers: {} }
      await handler({ request, response })
      expect(response.handled).toBeUndefined()
      expect(request.url.href).toBe('https://catalog.example.test/v1/mods?index=1')
      expect(request.headers).toEqual({ 'content-type': 'application/json' })
    } finally {
      if (previous === undefined) delete process.env.CURSEFORGE_PROXY_URL
      else process.env.CURSEFORGE_PROXY_URL = previous
    }
  })
})
