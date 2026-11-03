import type { LauncherAppPlugin } from './LauncherAppPlugin'
import type { Handler, Response as LauncherResponse } from './LauncherProtocolHandler'
import { isUpstreamService } from './productPolicy'
import { getCurseforgeProxyUrl } from './curseforgeProxy'

function setHeader(headers: Record<string, any>, name: string, value?: string) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key]
  }
  if (value) headers[name] = value
}

function rejectAuthentication(
  response: LauncherResponse,
  code: string,
  status = 401,
) {
  response.status = status
  response.headers = { 'content-type': 'application/json' }
  response.body = JSON.stringify({ error: code, message: code })
  response.handled = true
}

export const pluginApiFallback: LauncherAppPlugin = (app) => {
  const handler: Handler = async ({ request, response }) => {
    if (isUpstreamService(request.url)) {
      setHeader(request.headers, 'Authorization')
      setHeader(request.headers, 'DPoP')
      setHeader(request.headers, 'Cookie')
      rejectAuthentication(response, 'Feature unavailable in Grimo Launcher', 410)
    } else if (request.url.host === 'api.curseforge.com') {
      setHeader(request.headers, 'x-api-key')
      setHeader(request.headers, 'Authorization')
      setHeader(request.headers, 'Cookie')
      try {
        request.url = getCurseforgeProxyUrl(request.url)
      } catch {
        rejectAuthentication(response, 'CurseForge no está disponible temporalmente.', 503)
      }
    }
  }
  app.protocol.registerHandler('https', handler)
}
