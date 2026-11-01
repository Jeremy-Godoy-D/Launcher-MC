import type { GameProcess, LaunchHistoryRecord } from '@xmcl/runtime-api'
import { AnyError } from '@xmcl/utils'
import { writeFile as writeAtomically } from 'atomically'
import { createHash } from 'node:crypto'
import { realpath, rmdir, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { importPathParts } from '../util/importFile'
import { copyLogSnapshot, listLogDirectory, logDirectory, logFailure, logFile, readLogFile, unsafeLogPath, verifyLogLocation, writeLogSnapshot } from '../util/logFiles'

const MAX_LAUNCHES_PER_INSTANCE = 3
const evidenceNames = ['game.log', 'debug.log', 'crash-report.txt', 'launcher-output.log'] as const
const evidenceKeys = { 'game.log': 'gameLog', 'debug.log': 'debugLog', 'crash-report.txt': 'crashReport', 'launcher-output.log': 'launcherOutput' } as const
type EvidenceName = typeof evidenceNames[number]
type ActiveLaunch = Pick<GameProcess, 'launchId' | 'side' | 'options'>
const launchIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestamp = z.number().finite().nonnegative()
const availability = z.enum(['available', 'absent', 'ambiguous', 'unavailable'])
const manifest = z.object({
  launchId: z.string().regex(launchIdPattern), operationId: z.string().max(1024), pid: z.number().int().nonnegative(),
  side: z.enum(['client', 'server']), version: z.string().max(1024), minecraft: z.string().max(1024),
  state: z.enum(['running', 'exited']), startedAt: timestamp, readyAt: timestamp.optional(), endedAt: timestamp.optional(),
  exitCode: z.number().int().nullish().transform(value => value ?? undefined), signal: z.string().max(64).nullish().transform(value => value ?? undefined), crashed: z.boolean().optional(),
  evidence: z.object({ gameLog: availability, debugLog: availability, crashReport: availability, launcherOutput: availability }),
})

function instanceKey(instancePath: string) {
  const normalized = resolve(instancePath).replace(/\\/g, '/')
  return createHash('sha256').update(process.platform === 'win32' ? normalized.toLowerCase() : normalized).digest('hex')
}
function assertLaunchId(launchId: string) {
  if (typeof launchId !== 'string' || !launchIdPattern.test(launchId)) throw unsafeLogPath()
}
function parseManifest(data: unknown, launchId: string): LaunchHistoryRecord {
  const parsed = manifest.safeParse(data)
  if (!parsed.success || parsed.data.launchId !== launchId) throw new AnyError('InstanceLogInvalidManifest')
  return parsed.data
}

export class LaunchHistoryStore {
  private updates = new Map<string, Promise<unknown>>()

  constructor(private root: string, private activeLaunches: () => Promise<readonly ActiveLaunch[]> = async () => []) {}

  private update<T>(launchId: string, operation: () => Promise<T>) {
    assertLaunchId(launchId)
    const previous = this.updates.get(launchId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(operation).catch(logFailure)
    this.updates.set(launchId, next)
    const cleanup = () => {
      if (this.updates.get(launchId) === next) this.updates.delete(launchId)
    }
    void next.then(cleanup, cleanup)
    return next
  }

  private launchPath(instancePath: string, launchId: string) {
    assertLaunchId(launchId)
    return `${instanceKey(instancePath)}/${launchId}`
  }

  private async active(instancePath: string) {
    const key = instanceKey(instancePath)
    return (await this.activeLaunches()).filter(value => instanceKey(value.options.gameDirectory) === key)
  }

  private liveLog(record: LaunchHistoryRecord) {
    return record.side === 'server' ? 'server/logs/latest.log' : 'logs/latest.log'
  }

  private async resolveLiveEvidence(instancePath: string, records: LaunchHistoryRecord[]) {
    const active = await this.active(instancePath)
    for (const record of records) {
      if (record.state !== 'running' || record.evidence.gameLog !== 'absent') continue
      if (!active.some(value => value.launchId === record.launchId && value.side === record.side)) continue
      const end = record.endedAt ?? Infinity
      if (active.filter(value => value.side === record.side).length > 1 || records.some(other => other.launchId !== record.launchId && other.side === record.side && record.startedAt <= (other.endedAt ?? Infinity) && other.startedAt <= end)) {
        record.evidence.gameLog = 'ambiguous'
        continue
      }
      const target = await logFile(await realpath(instancePath), this.liveLog(record))
      if (target) {
        await verifyLogLocation(target.entries)
        if (target.info.mtimeMs >= record.startedAt) record.evidence.gameLog = 'available'
      }
    }
    return records
  }

  private async writeManifest(instancePath: string, record: LaunchHistoryRecord) {
    const path = this.launchPath(instancePath, record.launchId)
    const entries = await logDirectory(this.root, path, true)
    if (!entries) throw new AnyError('InstanceLogReadError')
    const previous = await logFile(this.root, `${path}/launch.json`)
    await verifyLogLocation(previous?.entries ?? entries)
    await writeAtomically(join(this.root, path, 'launch.json'), JSON.stringify(parseManifest(record, record.launchId), undefined, 2))
    await verifyLogLocation(entries)
  }

  async begin(instancePath: string, record: Omit<LaunchHistoryRecord, 'state' | 'evidence'>) {
    return this.update(record.launchId, async () => {
      if (await this.get(instancePath, record.launchId)) throw new AnyError('InstanceLogChanged')
      const launch = parseManifest({ ...record, state: 'running', evidence: { gameLog: 'absent', debugLog: 'absent', crashReport: 'absent', launcherOutput: 'absent' } }, record.launchId)
      await this.writeManifest(instancePath, launch)
      await this.prune(instancePath)
      return launch
    })
  }

  async markReady(instancePath: string, launchId: string, readyAt: number) {
    return this.update(launchId, async () => {
      const record = await this.get(instancePath, launchId)
      if (!record || record.state !== 'running') return
      record.readyAt = readyAt
      await this.writeManifest(instancePath, record)
    })
  }

  private async capture(instancePath: string, record: LaunchHistoryRecord, name: EvidenceName, sourcePath: string, endedAt: number) {
    const root = await realpath(instancePath)
    const source = resolve(instancePath, sourcePath.trim())
    const logical = relative(resolve(instancePath), source).replace(/\\/g, '/')
    const canonical = isAbsolute(sourcePath.trim()) ? relative(root, source).replace(/\\/g, '/') : logical
    const area = record.side === 'server' ? 'server/' : ''
    const expected = name === 'game.log' ? `${area}logs/latest.log` : `${area}logs/debug.log`
    const allowed = (path: string) => name === 'crash-report.txt'
      ? path.startsWith(`${area}crash-reports/`) && importPathParts(path).length === (record.side === 'server' ? 3 : 2) && /\.txt$/i.test(path)
      : path === expected
    const path = [logical, canonical].find(value => {
      try { importPathParts(value); return allowed(value) } catch { return false }
    })
    if (!path) throw unsafeLogPath()
    const target = await logFile(root, path)
    if (!target) return false
    if (target.info.mtimeMs < record.startedAt || target.info.mtimeMs > endedAt + 2000) throw new AnyError('InstanceLogChanged')
    const verifyOwner = async () => {
      if (name === 'crash-report.txt') return
      const active = await this.active(instancePath), records = await this.list(instancePath)
      if (active.some(other => other.side === record.side && other.launchId !== record.launchId) || records.some(other => other.side === record.side && other.launchId !== record.launchId && other.startedAt >= record.startedAt)) throw new AnyError('InstanceLogChanged')
    }
    await verifyOwner()
    const copied = await copyLogSnapshot(root, path, this.root, `${this.launchPath(instancePath, record.launchId)}/${name}`)
    await verifyOwner()
    return copied
  }

  async complete(instancePath: string, launchId: string, result: {
    endedAt: number; exitCode?: number | null; signal?: string | null; crashed: boolean
    crashReportPath?: string; crashReport?: string; launcherOutput?: string
    gameLogPath?: string; debugLogPath?: string; gameLogAmbiguous: boolean
  }) {
    return this.update(launchId, async () => {
      const previous = await this.get(instancePath, launchId)
      if (!previous || previous.state === 'exited') return
      const record = parseManifest({ ...previous, state: 'exited', endedAt: result.endedAt, exitCode: result.exitCode, signal: result.signal, crashed: result.crashed }, launchId)
      const capture = async (name: EvidenceName, operation: () => Promise<boolean>) => {
        try { record.evidence[evidenceKeys[name]] = await operation() ? 'available' : 'absent' } catch { record.evidence[evidenceKeys[name]] = 'unavailable' }
      }
      const text = async (name: EvidenceName, data: string) => {
        await writeLogSnapshot(this.root, `${this.launchPath(instancePath, launchId)}/${name}`, data)
        return true
      }
      if (result.launcherOutput) await capture('launcher-output.log', () => text('launcher-output.log', result.launcherOutput!))
      if (result.crashReportPath || result.crashReport) await capture('crash-report.txt', async () => {
        try {
          if (result.crashReportPath && await this.capture(instancePath, record, 'crash-report.txt', result.crashReportPath, result.endedAt)) return true
        } catch (error) { if (!result.crashReport) throw error }
        return result.crashReport ? text('crash-report.txt', result.crashReport) : false
      })
      if (result.gameLogAmbiguous) {
        record.evidence.gameLog = 'ambiguous'
        record.evidence.debugLog = 'ambiguous'
      } else {
        if (result.gameLogPath) await capture('game.log', () => this.capture(instancePath, record, 'game.log', result.gameLogPath!, result.endedAt))
        if (result.debugLogPath) await capture('debug.log', () => this.capture(instancePath, record, 'debug.log', result.debugLogPath!, result.endedAt))
      }
      await this.writeManifest(instancePath, record)
      await this.prune(instancePath)
    })
  }

  async list(instancePath: string) {
    try {
      const entries = await listLogDirectory(this.root, instanceKey(instancePath), 256)
      const records: LaunchHistoryRecord[] = []
      for (const entry of entries) {
        if (!launchIdPattern.test(entry.name)) continue
        const record = await this.get(instancePath, entry.name)
        if (record) records.push(record)
      }
      return await this.resolveLiveEvidence(instancePath, records.sort((a, b) => b.startedAt - a.startedAt))
    } catch (error) { return logFailure(error) }
  }

  async get(instancePath: string, launchId: string): Promise<LaunchHistoryRecord | undefined> {
    try {
      const raw = await readLogFile(this.root, `${this.launchPath(instancePath, launchId)}/launch.json`, 64 * 1024)
      if (!raw) return undefined
      let value: unknown
      try { value = JSON.parse(raw.toString('utf8')) } catch { throw new AnyError('InstanceLogInvalidManifest') }
      return parseManifest(value, launchId)
    } catch (error) { return logFailure(error) }
  }

  async readEvidence(instancePath: string, launchId: string, name: EvidenceName) {
    try {
      if (!evidenceNames.includes(name)) throw unsafeLogPath()
      const record = await this.get(instancePath, launchId)
      if (!record) return ''
      const availability = record.evidence[evidenceKeys[name]]
      if (availability === 'unavailable') throw new AnyError('InstanceLogCaptureError')
      if (availability === 'available') {
        const snapshot = await readLogFile(this.root, `${this.launchPath(instancePath, launchId)}/${name}`)
        if (!snapshot) throw new AnyError('InstanceLogReadError')
        return snapshot.toString('utf8')
      }
      if (name !== 'game.log' || availability !== 'absent' || record.state !== 'running') return ''
      const live = (await this.list(instancePath)).find(value => value.launchId === launchId)
      if (live?.evidence.gameLog !== 'available') return ''
      const content = await readLogFile(await realpath(instancePath), this.liveLog(live))
      const confirmed = (await this.list(instancePath)).find(value => value.launchId === launchId)
      return confirmed?.evidence.gameLog === 'available' ? content?.toString('utf8') ?? '' : ''
    } catch (error) { return logFailure(error) }
  }

  async findByCrashReport(instancePath: string, content: string) {
    if (!content) return undefined
    const records = await this.list(instancePath)
    for (const record of records) {
      if (record.evidence.crashReport !== 'available') continue
      if (await this.readEvidence(instancePath, record.launchId, 'crash-report.txt') === content) return record
    }
    return undefined
  }

  private async prune(instancePath: string) {
    const records = await this.list(instancePath), active = await this.active(instancePath)
    for (const record of records.slice(MAX_LAUNCHES_PER_INSTANCE)) {
      if (this.updates.has(record.launchId) || active.some(value => value.launchId === record.launchId)) continue
      const path = this.launchPath(instancePath, record.launchId)
      // Retain unfamiliar or unsafe entries; never recursively delete a history tree.
      try {
        const directory = await logDirectory(this.root, path)
        if (!directory) continue
        const entries = await listLogDirectory(this.root, path, 256)
        if (entries.some(entry => !entry.isFile() || ![...evidenceNames, 'launch.json'].includes(entry.name))) continue
        const files = await Promise.all(entries.map(entry => logFile(this.root, `${path}/${entry.name}`)))
        if (files.some(file => !file)) continue
        for (const file of files) await verifyLogLocation(file!.entries)
        for (const file of files) {
          await verifyLogLocation(file!.entries)
          await unlink(file!.path)
        }
        await verifyLogLocation(directory)
        await rmdir(join(this.root, path))
      } catch { /* Retention is best effort; preserve data when ownership is uncertain. */ }
    }
  }
}
