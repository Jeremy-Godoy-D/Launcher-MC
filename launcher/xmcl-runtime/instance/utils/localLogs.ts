import { AnyError } from '@xmcl/utils'
import { unlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { importPathParts } from '../../util/importFile'
import { listLogDirectory, logFailure, logFile, MAX_LOG_BYTES, readLogFile, unsafeLogPath, verifyLogLocation } from '../../util/logFiles'

export { MAX_LOG_BYTES } from '../../util/logFiles'
export type LogArea = 'logs' | 'server/logs' | 'crash-reports' | 'server/crash-reports'
const unzip = promisify(gunzip)
function logName(name: string, area: LogArea) {
  try {
    if (typeof name !== 'string' || name.length > 255 || importPathParts(name).length !== 1 || !(area.endsWith('crash-reports') ? /\.(txt|gz)$/i : /\.(log|txt|gz)$/i).test(name)) throw unsafeLogPath()
  } catch { throw unsafeLogPath() }
}

export async function listLocalLogs(root: string, area: LogArea) {
  try {
    const entries = await listLogDirectory(root, area, 10000)
    return entries.filter(entry => {
      if (!entry.isFile()) return false
      try { logName(entry.name, area); return true } catch { return false }
    }).map(entry => entry.name).sort()
  } catch (error) { return logFailure(error) }
}

export async function readLocalLog(root: string, area: LogArea, name: string) {
  try {
    logName(name, area)
    const data = await readLogFile(root, `${area}/${name}`)
    return data && /\.gz$/i.test(name) ? await unzip(data, { maxOutputLength: MAX_LOG_BYTES }) : data
  } catch (error) { return logFailure(error) }
}

export async function removeLocalLog(root: string, area: LogArea, name: string) {
  try {
    logName(name, area)
    const target = await logFile(root, `${area}/${name}`)
    if (!target) return
    await verifyLogLocation(target.entries)
    await unlink(target.path).catch(error => { if (error.code !== 'ENOENT') throw error })
  } catch (error) { return logFailure(error) }
}

export async function localLogPath(root: string, area: LogArea, name: string) {
  try {
    logName(name, area)
    const target = await logFile(root, `${area}/${name}`)
    if (!target) throw new AnyError('InstanceLogReadError')
    await verifyLogLocation(target.entries)
    return target.path
  } catch (error) { return logFailure(error) }
}
