import { LibraryInfo, Version } from '@xmcl/core'
import { getMmcLocalLibraryNames, getMmcVersionFromManifest, type MMCModpackManifest } from '@xmcl/instance'
import { createHash } from 'crypto'
import filenamify from 'filenamify'
import { importPathParts, writeImmutableImportFiles } from './importFile'
import type { isolateImportedClient } from './importedClient'

export interface MmcStandaloneVersionOptions {
  manifest: MMCModpackManifest
  name: string
  gameDirectory: string
  readLocalLibrary: (mavenPath: string) => Promise<Buffer | undefined>
  refreshVersion: (id: string) => Promise<unknown>
  includePatchArguments?: boolean
  client?: ReturnType<typeof isolateImportedClient>
}

export function resolveMmcStandaloneVersion(manifest: MMCModpackManifest, includePatchArguments = false) {
  const version = getMmcVersionFromManifest(manifest, 'mmc')
  if (!version || !includePatchArguments) return version
  const ordered = manifest.json.components.map((component, index) => ({ patch: manifest.patches?.[component.uid], index }))
    .filter(item => !!item.patch).sort((a, b) => (a.patch!.order ?? a.index) - (b.patch!.order ?? b.index))
  const extraJvm = ordered.flatMap(({ patch }) => patch!['+jvmArgs'] || [])
  const tweakers = ordered.flatMap(({ patch }) => patch!['+tweakers'] || [])
  if (extraJvm.length || tweakers.length) {
    // Preserve legacy JVM defaults when translating additive Prism arguments.
    const normalized = Version.normalizeVersionJson(JSON.stringify(version), '').arguments
    version.arguments = { game: [...normalized.game, ...tweakers.flatMap(name => ['--tweakClass', name])], jvm: [...normalized.jvm, ...extraJvm] }
  }
  return version
}

/**
 * Persist only a version reconstructed from the supported MultiMC patch fields.
 * ZIP and directory imports share IDs, local-library validation and registration.
 */
export async function persistMmcStandaloneVersion({
  manifest, name, gameDirectory, readLocalLibrary, refreshVersion, includePatchArguments, client,
}: MmcStandaloneVersionOptions): Promise<string | undefined> {
  const version = resolveMmcStandaloneVersion(manifest, includePatchArguments)
  if (!version) return undefined
  if (client) {
    version.jar = client.id
    version.downloads = { ...version.downloads, client: client.download }
  }

  // Names alone collide across packs (and with installed vanilla versions).
  const hash = createHash('sha256').update(JSON.stringify(version)).digest('hex').slice(0, 16)
  const id = `mmc-${filenamify(name || 'instance', { maxLength: 80 }).trim() || 'instance'}-${hash}`
  version.id = id

  const files: { path: string; data: Buffer }[] = []
  if (client?.data) files.push({ path: `versions/${client.id}/${client.id}.jar`, data: client.data })
  for (const library of getMmcLocalLibraryNames(version)) {
    const mavenPath = LibraryInfo.resolve(library).path
    importPathParts(mavenPath)
    const content = await readLocalLibrary(mavenPath)
    if (!content) {
      throw new Error(`Cannot find local library ${library} (${mavenPath}) in the MultiMC instance`)
    }
    files.push({ path: `libraries/${mavenPath}`, data: content })
  }

  files.push({ path: `versions/${id}/${id}.json`, data: Buffer.from(JSON.stringify(version, null, 2)) })
  await writeImmutableImportFiles(gameDirectory, files)
  await refreshVersion(id)
  return id
}
