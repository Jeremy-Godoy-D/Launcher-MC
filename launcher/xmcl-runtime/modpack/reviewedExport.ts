import type { ResolvedVersion } from '@xmcl/core'
import { getCurseforgeModpackFromInstance, getModrinthModpackFromInstance, type Instance } from '@xmcl/instance'
import type { InstanceExportPreview, ReviewedInstanceExport } from '@xmcl/runtime-api'
import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { Readable } from 'node:stream'
import filenamify from 'filenamify'
import { ZipFile } from 'yazl'
import { previewFolderFiles } from '../instanceIO/utils/previewFolderFiles'
import { importPathParts, readImportFile } from '../util/importFile'
import { writeZipFile, type ZipTrackerEvents } from '../util/zip'
import type { Tracker } from '@xmcl/installer'
import { offlineModpackFiles } from './utils/exportOffline'

const credentials = /(^|\/)(\.env(?:\..*)?|launcher_accounts\.json|accounts\.json|user\.json|credentials(?:\..*)?|secrets?(?:\..*)?|tokens?(?:\..*)?)$|\.(pem|key|pfx|p12)$/i
const defaults = /^(mods|config|defaultconfigs|resourcepacks|shaderpacks|scripts|kubejs|patchouli_books)\//i
const failure = (name: string) => Object.assign(new Error(name), { name })
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

export function exportIdentity(instance: Instance) {
  return { name: instance.name, description: instance.description, author: instance.author, runtime: instance.runtime, version: instance.version }
}

export async function previewInstanceExport(instance: Instance): Promise<InstanceExportPreview> {
  if (instance.edition === 'bedrock' || !instance.runtime.minecraft) throw failure('ExportInstanceUnavailable')
  const files = (await previewFolderFiles(instance.path)).filter(file => !credentials.test(file.path)).map(file => {
    importPathParts(file.path)
    return { path: file.path, size: file.size!, sha256: file.hashes.sha256, selected: defaults.test(file.path) }
  }).sort((a, b) => a.path.localeCompare(b.path))
  const portable = !/^(vanilla-|mmc-)/.test(instance.version || '') && !instance.runtime.optifine && !instance.runtime.labyMod
  return { fingerprint: hash(JSON.stringify([exportIdentity(instance), files])), files, portable: !!portable }
}

/** Stage reviewed bytes, then publish one complete archive without replacing any destination. */
export async function exportReviewedInstance(instance: Instance, root: string, options: ReviewedInstanceExport, signal: AbortSignal, tracker?: Tracker<ZipTrackerEvents>, resolved?: ResolvedVersion, verify?: () => Promise<void>) {
  if (!options || !['modrinth', 'curseforge', 'offline'].includes(options.format) || typeof options.version !== 'string' || !options.version.trim() || options.version.length > 80 || typeof options.destinationDirectory !== 'string' || !isAbsolute(options.destinationDirectory) || !Array.isArray(options.files) || options.files.length > 100000 || options.files.some(path => typeof path !== 'string')) throw failure('ExportInvalid')
  const preview = await previewInstanceExport(instance)
  if (options.fingerprint !== preview.fingerprint) throw failure('ExportSourceChanged')
  if (options.format !== 'offline' && (!preview.portable || resolved?.clientJar)) throw failure('ExportNeedsOffline')
  const selected = new Set(options.files)
  const reviewed = new Set(preview.files.map(file => file.path))
  if (selected.size !== options.files.length || options.files.some(path => !reviewed.has(path))) throw failure('ExportInvalid')
  const parent = await realpath(options.destinationDirectory)
  if (!(await lstat(parent)).isDirectory()) throw failure('ExportInvalid')
  const insideInstance = relative(await realpath(instance.path), parent)
  if (!insideInstance || insideInstance !== '..' && !insideInstance.startsWith('../') && !insideInstance.startsWith('..\\') && !isAbsolute(insideInstance)) throw failure('ExportInvalid')
  const name = filenamify(instance.name, { replacement: '_', maxLength: 100 }) || 'instance'
  const version = filenamify(options.version.trim(), { replacement: '_', maxLength: 80 })
  if (!version) throw failure('ExportInvalid')
  const destination = join(parent, `${name}-${version}${options.format === 'offline' ? '-offline.zip' : options.format === 'modrinth' ? '.mrpack' : '.zip'}`)
  try { await lstat(destination); throw failure('ExportDestinationExists') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  signal.throwIfAborted()
  const temporary = await mkdtemp(join(parent, '.grimo-export-'))
  if (dirname(temporary) !== parent || !temporary.startsWith(join(parent, '.grimo-export-'))) throw failure('ExportInvalid')
  const zip = new ZipFile()
  try {
    let index = 0
    async function stage(source: string, path: string, entry: string, expected?: { sha256?: string; sha1?: string; size?: number }) {
      signal.throwIfAborted()
      const data = await readImportFile(source, path, 512 * 1024 * 1024)
      if (!data || expected?.size !== undefined && data.length !== expected.size || expected?.sha256 && hash(data) !== expected.sha256 || expected?.sha1 && createHash('sha1').update(data).digest('hex') !== expected.sha1) throw failure('ExportSourceChanged')
      const staged = join(temporary, 'files', String(index++))
      await mkdir(dirname(staged), { recursive: true })
      await writeFile(staged, data, { flag: 'wx' })
      zip.addFile(staged, entry)
    }
    for (const file of preview.files) if (selected.has(file.path)) await stage(instance.path, file.path, `${options.format === 'offline' ? '' : 'overrides/'}${file.path}`, file)
    if (options.format === 'offline') {
      if (!resolved) throw failure('ExportMissingRuntime')
      for (const file of await offlineModpackFiles(root, resolved)) await stage(root, file.path, file.path, file)
      zip.addBuffer(Buffer.from(JSON.stringify({ profiles: { grimo: { name: instance.name, lastVersionId: resolved.id } }, selectedProfile: 'grimo' })), 'launcher_profiles.json')
    } else {
      const manifest = options.format === 'modrinth' ? { ...getModrinthModpackFromInstance(instance), versionId: options.version.trim() } : { ...getCurseforgeModpackFromInstance(instance), version: options.version.trim() }
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), options.format === 'modrinth' ? 'modrinth.index.json' : 'manifest.json')
      zip.addEmptyDirectory('overrides')
    }
    const stagedZip = join(temporary, 'archive.zip')
    await writeZipFile(zip, stagedZip, signal, tracker)
    await verify?.()
    signal.throwIfAborted()
    try { await link(stagedZip, destination) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw failure('ExportDestinationExists'); throw error }
    return destination
  } finally {
    ;(zip.outputStream as Readable).destroy()
    await rm(temporary, { recursive: true, force: true }).catch(error => {
      console.warn('Temporary export cleanup failed', typeof error?.code === 'string' ? error.code : 'unknown')
    })
  }
}
