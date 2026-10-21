export const DEFAULT_GITHUB_REPO = process.env.LAUNCHER_GITHUB_REPO || 'Jeremy-Godoy-D/Launcher-MC'

export function isUpstreamService(input: string | URL | Request): boolean {
  const { hostname } = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  return hostname === 'xmcl.app' || hostname.endsWith('.xmcl.app') || hostname === 'xmcl-core-api.azurewebsites.net'
}
