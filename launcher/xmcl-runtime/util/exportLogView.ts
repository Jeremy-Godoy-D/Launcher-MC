import { writeFile } from 'atomically'
import { isAbsolute } from 'node:path'
import { lstat } from 'node:fs/promises'
import { importPathParts } from './importFile'

type Choice = { canceled: boolean; filePath?: string }

/** The destination comes only from the native picker, never from the renderer payload. */
export async function exportLogView(text: unknown, name: unknown, select: (name: string) => Promise<Choice>) {
  try {
    if (typeof text !== 'string' || text.length > 1024 * 1024 || typeof name !== 'string' || name.length > 180 || !/\.log$/i.test(name) || importPathParts(name).length !== 1) throw new Error('Invalid log view')
    const choice = await select(name)
    if (choice.canceled) return false
    if (typeof choice.filePath !== 'string' || choice.filePath.length > 32768 || choice.filePath.includes('\0') || !isAbsolute(choice.filePath) || !/\.(log|txt)$/i.test(choice.filePath)) throw new Error('Invalid log destination')
    const previous = await lstat(choice.filePath, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (previous && (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1n)) throw new Error('Unsafe log destination')
    await writeFile(choice.filePath, text)
    return true
  } catch { throw new Error('Could not export log view') }
}
