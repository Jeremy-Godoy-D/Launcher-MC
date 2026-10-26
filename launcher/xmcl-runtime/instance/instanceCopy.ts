import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { link, lstat, mkdir, mkdtemp, realpath, rm, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { writeFile as writeAtomically } from 'atomically'
import { duplicateInstance, isInstanceInstallPath, type DuplicateInstanceTrackerEvents } from '@xmcl/instance'
import { previewFolderFiles } from '../instanceIO/utils/previewFolderFiles'
import { importPathParts, readImportFile } from '../util/importFile'

export const COPY_JOB = '.copy-job.json'
export interface InstanceCopyJob {
  version: 1
  id: string
  source: string
  files: { path: string; size: number; sha256: string }[]
}
const failure = (name: string, cause?: unknown) => Object.assign(new Error(name, { cause }), { name })

export async function assertInstanceCopyComplete(path: string) {
  try { await lstat(join(path, COPY_JOB)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  throw failure('InstanceCopyIncomplete')
}

export async function prepareInstanceCopy(source: string, signal: AbortSignal): Promise<InstanceCopyJob> {
  await assertInstanceCopyComplete(source)
  const files = await previewFolderFiles(source)
  signal.throwIfAborted()
  const job: InstanceCopyJob = { version: 1, id: randomUUID(), source, files: files.map(file => ({ path: file.path, size: file.size!, sha256: file.hashes.sha256 })) }
  if (Buffer.byteLength(JSON.stringify(job)) > 32 * 1024 * 1024) throw failure('InstanceCopyTooLarge')
  return job
}

export async function readInstanceCopy(path: string): Promise<InstanceCopyJob | undefined> {
  const bytes = await readImportFile(path, COPY_JOB, 32 * 1024 * 1024)
  if (!bytes) return
  try {
    const job = JSON.parse(bytes.toString('utf8')) as InstanceCopyJob
    if (job.version !== 1 || typeof job.id !== 'string' || !/^[a-f0-9-]{36}$/.test(job.id) || typeof job.source !== 'string' || !isAbsolute(job.source) || parse(job.source).root === job.source || !Array.isArray(job.files) || job.files.length > 100000) throw failure('InstanceCopyInvalid')
    const seen = new Set<string>()
    for (const file of job.files) {
      if (typeof file.path !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw failure('InstanceCopyInvalid')
      importPathParts(file.path)
      if (isInstanceInstallPath(file.path) || file.path.toLowerCase() === 'instance.json' || seen.has(file.path.toLowerCase())) throw failure('InstanceCopyInvalid')
      seen.add(file.path.toLowerCase())
    }
    return { version: 1, id: job.id, source: job.source, files: job.files.map(file => ({ path: file.path, size: file.size, sha256: file.sha256 })) }
  } catch (error) { throw failure('InstanceCopyInvalid', error) }
}

async function checkedFile(root: string, path: string, create = false) {
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw failure('InstanceCopyUnsafePath')
  const parts = importPathParts(path)
  let directory = root
  for (const part of parts.slice(0, -1)) {
    directory = join(directory, part)
    if (create) await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(directory)
    if (info.isSymbolicLink() || !info.isDirectory()) throw failure('InstanceCopyUnsafePath')
  }
  const file = join(directory, parts.at(-1)!)
  try { const info = await lstat(file); if (info.isSymbolicLink() || !info.isFile()) throw failure('InstanceCopyUnsafePath') } catch (error) { if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return file
}

async function matches(file: string, expected: InstanceCopyJob['files'][number], signal: AbortSignal) {
  if ((await lstat(file)).size !== expected.size) return false
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk)
  return hash.digest('hex') === expected.sha256
}

export async function runInstanceCopy(job: InstanceCopyJob, destination: string, signal: AbortSignal, tracker?: <E extends { phase: keyof DuplicateInstanceTrackerEvents; payload: DuplicateInstanceTrackerEvents[keyof DuplicateInstanceTrackerEvents] }>(event: E) => void) {
  destination = resolve(destination)
  const root = await realpath(destination), source = await realpath(job.source)
  if (root === source) throw failure('InstanceCopyUnsafePath')
  const stop = new AbortController(), combined = AbortSignal.any([signal, stop.signal])
  const expected = new Map(job.files.map(file => [file.path, file]))
  let firstFailure: unknown
  try {
    await duplicateInstance({ instancePath: job.source, newPath: destination, signal: combined, tracker, files: job.files.map(file => ({ path: file.path, size: file.size, hashes: { sha256: file.sha256 } })), transferFile: async (src, dst) => {
      let temporary = ''
      try {
        combined.throwIfAborted()
        const path = relative(job.source, src).replaceAll('\\', '/'), file = expected.get(path)
        if (!file || dst !== join(destination, ...importPathParts(path))) throw failure('InstanceCopyInvalid')
        const target = await checkedFile(destination, path, true)
        try {
          await lstat(target)
          if (await matches(target, file, combined)) return
          throw failure('InstanceCopyConflict')
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        const input = await checkedFile(job.source, path).catch(error => { throw failure('InstanceCopySourceChanged', error) })
        temporary = await mkdtemp(join(destination, `.copy-temp-${job.id}-`))
        if (dirname(temporary) !== destination || !temporary.startsWith(join(destination, `.copy-temp-${job.id}-`))) throw failure('InstanceCopyUnsafePath')
        const staged = join(temporary, 'file'), hash = createHash('sha256')
        let size = 0
        await pipeline(createReadStream(input), new Transform({ transform(chunk, _, callback) {
          size += chunk.length
          if (size > file.size) { callback(failure('InstanceCopySourceChanged')); return }
          hash.update(chunk); callback(null, chunk)
        } }), createWriteStream(staged, { flags: 'wx' }), { signal: combined })
        if (size !== file.size || hash.digest('hex') !== file.sha256) throw failure('InstanceCopySourceChanged')
        combined.throwIfAborted()
        await checkedFile(destination, path, true)
        try { await link(staged, target) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          if (!await matches(target, file, combined)) throw failure('InstanceCopyConflict', error)
        }
      } catch (error) {
        if (!firstFailure && !signal.aborted) firstFailure = error
        stop.abort()
        throw error
      } finally {
        if (temporary && dirname(temporary) === destination && temporary.startsWith(join(destination, `.copy-temp-${job.id}-`))) await rm(temporary, { recursive: true, force: true }).catch(error => console.warn('Copy staging cleanup failed', typeof error?.code === 'string' ? error.code : 'unknown'))
      }
    } })
  } catch (error) { throw firstFailure || error }
  signal.throwIfAborted()
  for (const file of job.files) if (!await matches(await checkedFile(destination, file.path), file, signal)) throw failure('InstanceCopyConflict')
  if (JSON.stringify(await readInstanceCopy(destination)) !== JSON.stringify(job)) throw failure('InstanceCopyInvalid')
  await unlink(join(destination, COPY_JOB))
}

export async function saveInstanceCopy(destination: string, job: InstanceCopyJob) {
  const data = JSON.stringify(job)
  if (Buffer.byteLength(data) > 32 * 1024 * 1024) throw failure('InstanceCopyTooLarge')
  await writeAtomically(join(destination, COPY_JOB), data)
}
