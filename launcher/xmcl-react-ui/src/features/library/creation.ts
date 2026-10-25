import type { InstanceService } from '@xmcl/runtime-api/src/services/InstanceService'
import type { InstanceInstallService } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import type { ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import type { VersionMetadataService } from '@xmcl/runtime-api/src/services/VersionMetadataService'
import { InstanceDataSchema } from '../../../../packages/instance/instance'
import { isInstanceInstallPath, type InstanceFile } from '../../../../packages/instance/files'
import { validateInstanceName } from '../../../../xmcl-keystone-ui/src/util/instanceName'
import { DEFAULT_LINK_PREFERENCES, type InstanceCreationLinkPreferences } from '@xmcl/runtime-api/src/util/instanceCreation'

export const LINKS_KEY = 'addInstanceLinkPreferences'
export function readLinkPreferences(getStorage: () => Pick<Storage, 'getItem'>) {
  const defaults = { ...DEFAULT_LINK_PREFERENCES }
  try {
    const text = getStorage().getItem(LINKS_KEY)
    if (!text) return { preferences: defaults, error: false, writable: true }
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== undefined && data.version !== 1) return { preferences: defaults, error: true, writable: false }
    for (const key of ['saves', 'resourcepacks', 'shaderpacks', 'options', 'servers'] as const) defaults[key] = data[key] === true
    return { preferences: defaults, error: false, writable: true }
  } catch { return { preferences: defaults, error: true, writable: false } }
}
export type LinkPreferences = InstanceCreationLinkPreferences
export type AdvancedCreation = { description: string; author: string; java: string; memory: 'inherit' | 'auto' | 'manual'; min: string; max: string }
export const defaultAdvanced: AdvancedCreation = { description: '', author: '', java: '', memory: 'inherit', min: '', max: '' }
export function advancedOptions(value: AdvancedCreation): Partial<CreationOptions> {
  const result: Partial<CreationOptions> = { description: value.description.trim(), author: value.author.trim() }
  if (result.description!.length > 1000 || result.author!.length > 100 || containsControls(value.java) || value.java.length > 4096) throw new Error('Invalid advanced settings')
  if (value.java) result.java = value.java
  if (value.memory === 'auto') result.assignMemory = 'auto'
  else if (value.memory === 'manual') {
    const min = value.min === '' ? undefined : Number(value.min)
    const max = Number(value.max)
    if (!/^\d+$/.test(value.max) || !Number.isSafeInteger(max) || max <= 0 || min !== undefined && (!/^\d+$/.test(value.min) || !Number.isSafeInteger(min) || min < 0 || min > max)) throw new Error('Invalid memory settings')
    Object.assign(result, { assignMemory: true, minMemory: min, maxMemory: max })
  } else if (value.memory !== 'inherit') throw new Error('Invalid memory mode')
  return result
}
export function importUrl(value: string) {
  const text = value.trim()
  if (text.length > 4096 || containsControls(text)) throw new Error('Invalid import URL')
  const url = new URL(text)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname) throw new Error('Invalid import URL')
  return url.href
}

export type CreationOptions = Parameters<InstanceService['createInstance']>[0]
export type ImportPreviewData = ModpackState & { prismVersion?: { source: string; fingerprint: string } }
export const loaders = [
  'Vanilla',
  'Fabric',
  'Forge',
  'NeoForge',
  'Quilt',
  'OptiFine',
  'LabyMod',
] as const
export type Loader = (typeof loaders)[number]
const runtimeKeys = {
  Fabric: 'fabricLoader',
  Forge: 'forge',
  NeoForge: 'neoForged',
  Quilt: 'quiltLoader',
  OptiFine: 'optifine',
  LabyMod: 'labyMod',
} as const
const containsControls = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)

export function validInstanceName(name: string) {
  return name.length <= 100 && !containsControls(name) && validateInstanceName(name) === true
}
export const validVersionId = (value: string) =>
  value.length <= 200 && !containsControls(value) && validateInstanceName(value) === true

export function creationOptions(
  name: string,
  minecraft: string,
  loader: Loader,
  version: string,
): CreationOptions {
  if (
    !validInstanceName(name) ||
    !validVersionId(minecraft) ||
    (loader !== 'Vanilla' && !validVersionId(version))
  )
    throw new Error('Invalid instance configuration')
  return {
    name,
    edition: 'java',
    runtime: { minecraft, ...(loader === 'Vanilla' ? {} : { [runtimeKeys[loader]]: version }) },
  }
}

export async function loaderVersions(
  service: VersionMetadataService,
  loader: Loader,
  minecraft: string,
  force = false,
) {
  if (!validVersionId(minecraft)) return []
  switch (loader) {
    case 'Vanilla':
      return []
    case 'Fabric':
    case 'Quilt': {
      const result = await (loader === 'Fabric'
        ? service.getFabricVersions(force)
        : service.getQuiltVersions(force))
      return result.gameVersions.includes(minecraft)
        ? result.loaderVersions.map((item) => item.version)
        : []
    }
    case 'Forge':
      return (await service.getForgeVersions(minecraft, force))
        .filter((item) => item.mcversion === minecraft)
        .map((item) => item.version)
    case 'NeoForge':
      return service.getNeoForgedVersions(minecraft, force)
    case 'OptiFine':
      return (await service.getOptifineVersions(force))
        .filter((item) => item.mcversion.replace(/\.0$/, '') === minecraft)
        .map((item) => `${item.type}_${item.patch}`)
    case 'LabyMod': {
      const result = await service.getLabyModManifest(force)
      return result.minecraftVersions.some((item) => item.tag === minecraft)
        ? [result.labyModVersion]
        : []
    }
  }
}

/** Only game identity crosses from an untrusted archive into a newly created instance. */
export function importedOptions(config: ModpackState['config'], name: string): CreationOptions {
  const data = InstanceDataSchema.parse(config)
  if (
    data.edition !== 'java' ||
    !data.runtime.minecraft ||
    !validInstanceName(name) ||
    Object.values(data.runtime).some((value) => value && !validVersionId(value)) ||
    (data.version && !validVersionId(data.version))
  )
    throw new Error('Invalid Java modpack configuration')
  return {
    name,
    edition: 'java',
    runtime: data.runtime,
    version: data.version,
    description: data.description,
    author: data.author,
    ...(data.upstream?.type === 'curseforge-modpack' || data.upstream?.type === 'modrinth-modpack'
      ? { upstream: data.upstream }
      : {}),
  }
}

export function validateImportFiles(files: readonly Pick<InstanceFile, 'path'>[]) {
  const seen = new Set<string>()
  for (const file of files) {
    const path = file.path.replaceAll('\\', '/')
    if (
      !path ||
      containsControls(path) ||
      /[<>:"|?*]/.test(path) ||
      path.startsWith('/') ||
      path
        .split('/')
        .some((part) => validateInstanceName(part) !== true) ||
      isInstanceInstallPath(path) ||
      path.toLowerCase() === 'instance.json' ||
      seen.has(path.toLowerCase())
    )
      throw new Error('Unsafe modpack file path')
    seen.add(path.toLowerCase())
  }
}

export class CreationSession {
  path = ''
  private staged = false
  private running = false
  private prepared = false
  constructor(
    private instances: Pick<InstanceService, 'createInstance'>,
    private installs: Pick<
      InstanceInstallService,
      'stageInstanceFiles' | 'applyInstanceInstallManifest' | 'resumeInstanceInstall'
    >,
  ) {}
  async run(
    options: CreationOptions,
    files: InstanceFile[] = [],
    onCreated?: (path: string) => void,
    afterCreate?: (path: string) => Promise<void>,
  ) {
    if (this.running) throw new Error('Creation already running')
    validateImportFiles(files)
    this.running = true
    try {
      this.path ||= await this.instances.createInstance(options)
      onCreated?.(this.path)
      if (files.length) {
        if (!this.staged) {
          await this.installs.stageInstanceFiles({ path: this.path, oldFiles: [], files })
          this.staged = true
        }
        const errors = await this.installs.resumeInstanceInstall(this.path)
        if (errors?.length) throw new Error('File integrity check failed')
        await this.installs.applyInstanceInstallManifest(this.path)
      }
      if (!this.prepared && afterCreate) {
        await afterCreate(this.path)
        this.prepared = true
      }
      return this.path
    } finally {
      this.running = false
    }
  }
}
