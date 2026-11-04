import { ModrinthV2Client } from '@xmcl/modrinth'
import { PresentationServiceKey, type PresentationService as IPresentationService, type InstancePresentation } from '@xmcl/runtime-api'
import { join } from 'node:path'
import { Inject, LauncherApp, LauncherAppKey } from '~/app'
import { createCurseforgeProxyClient } from '~/app/curseforgeProxy'
import { InstanceService } from '~/instance'
import { AbstractService, ExposeServiceKey } from '~/service'
import { MediaCache, readPublicBody } from './mediaCache'

@ExposeServiceKey(PresentationServiceKey)
export class PresentationService extends AbstractService implements IPresentationService {
  private readonly cache: MediaCache
  private readonly modrinth: ModrinthV2Client
  private readonly curseforge: ReturnType<typeof createCurseforgeProxyClient>

  constructor(@Inject(LauncherAppKey) app: LauncherApp, @Inject(InstanceService) private readonly instances: InstanceService) {
    super(app)
    this.cache = new MediaCache(join(app.appDataPath, 'presentation-cache-v1'), (...args) => app.fetch(...args))
    // Public metadata only: do not acquire a linked Modrinth account or forward credentials.
    const fetch = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      const response = await app.fetch(input, { ...init, credentials: 'omit', redirect: 'error' })
      try {
        return new Response(new Uint8Array(await readPublicBody(response, 2 * 1024 * 1024)), { status: response.status, headers: { 'content-type': 'application/json' } })
      } catch { await response.body?.cancel().catch(() => {}); throw new Error('invalid_project_media') }
    }
    this.modrinth = new ModrinthV2Client({ fetch })
    this.curseforge = createCurseforgeProxyClient(fetch)
  }

  async resolveInstanceMedia(instancePath: string): Promise<InstancePresentation | undefined> {
    if (typeof instancePath !== 'string') throw new Error('invalid_instance')
    await this.instances.initialize()
    const instance = this.instances.state.all[instancePath]
    if (!instance || instance.edition === 'bedrock') return
    const upstream = instance.upstream
    let provider: InstancePresentation['provider']
    let id: string
    if (upstream?.type === 'modrinth-modpack' && /^[a-zA-Z0-9]{8}$/.test(upstream.projectId)) { provider = 'modrinth'; id = upstream.projectId }
    else if (upstream?.type === 'curseforge-modpack' && Number.isSafeInteger(upstream.modId) && upstream.modId > 0) { provider = 'curseforge'; id = String(upstream.modId) }
    else return
    const result = await this.cache.resolve(`${provider}:${id}`, async signal => {
      if (provider === 'modrinth') {
        const project = await this.modrinth.getProject(id, signal)
        if (project.id !== id || project.project_type !== 'modpack') return []
        const gallery = Array.isArray(project.gallery) ? project.gallery : []
        return [...gallery.filter(image => image.featured), ...gallery.filter(image => !image.featured)].flatMap(image => [image.raw_url, image.url])
      }
      const project = await this.curseforge.getMod(Number(id), signal)
      if (project.id !== Number(id) || project.gameId !== 432 || project.classId !== 4471) return []
      return Array.isArray(project.screenshots) ? project.screenshots.filter(image => image.modId === Number(id)).map(image => image.url) : []
    })
    if (!result) return
    return { image: result.image, sourceUrl: result.sourceUrl, provider, projectUrl: provider === 'modrinth' ? `https://modrinth.com/modpack/${id}` : `https://www.curseforge.com/projects/${id}` }
  }

  async clearCache() { await this.cache.clear() }
}
