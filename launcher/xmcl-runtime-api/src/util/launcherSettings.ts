import { z } from 'zod'
import type { Settings } from '../entities/setting'

const text = z.string().max(32768).refine(value => !value.includes('\0'))
const args = z.array(text).max(1024).refine(value => value.reduce((size, argument) => size + argument.length, 0) <= 256 * 1024)
const schema = z.object({
  globalJava: text, globalAssignMemory: z.union([z.boolean(), z.literal('auto')]),
  globalMinMemory: z.number().int().min(0).max(2147483647), globalMaxMemory: z.number().int().min(0).max(2147483647),
  globalVmOptions: args, globalMcOptions: args,
  globalResolution: z.object({ width: z.number().int().min(1).max(32768).optional(), height: z.number().int().min(1).max(32768).optional(), fullscreen: z.boolean().optional(), monitor: text.optional() }).strict(),
  globalFastLaunch: z.boolean(), globalHideLauncher: z.boolean(), globalShowLog: z.boolean(),
  locale: z.string().min(1).max(64), apiSetsPreference: z.enum(['', 'mojang', 'bmcl']),
  httpProxy: z.string().max(4096), httpProxyEnabled: z.boolean(),
  maxSockets: z.number().int().min(0).max(256), maxAPISockets: z.number().int().min(0).max(256),
  allowPrerelease: z.boolean(), autoDownload: z.boolean(), autoInstallOnAppQuit: z.boolean(),
}).strict()
export const launcherSettingsKeys = Object.keys(schema.shape) as (keyof z.infer<typeof schema>)[]
export type LauncherSettingsChanges = Partial<z.infer<typeof schema>>
export interface EditLauncherSettings { expected: Record<string, unknown>; changes: LauncherSettingsChanges }
export const launcherSettingsConflict = () => Object.assign(new Error('Launcher settings changed'), { name: 'LauncherSettingsConflict' })
export function parseLauncherSettingsEdit(value: EditLauncherSettings) {
  const input = z.object({ expected: z.record(z.string(), z.unknown()), changes: schema.partial() }).strict().parse(value)
  if (Object.values(input.changes).some(value => value === undefined)) throw new Error('Invalid settings change')
  const keys = Object.keys(input.changes) as (keyof LauncherSettingsChanges)[], review = new Set(keys)
  for (const group of [['globalAssignMemory', 'globalMinMemory', 'globalMaxMemory'], ['httpProxy', 'httpProxyEnabled']] as const) if (group.some(key => review.has(key))) for (const key of group) review.add(key)
  if (Object.keys(input.expected).length !== review.size || Object.keys(input.expected).some(key => !review.has(key as keyof LauncherSettingsChanges)) || [...review].some(key => !Object.hasOwn(input.expected, key))) throw new Error('Invalid settings review')
  if (JSON.stringify(input.expected).length > 1024 * 1024) throw new Error('Invalid settings review')
  return { ...input, review: [...review] }
}
export function validateLauncherSettings(current: Settings, changes: LauncherSettingsChanges) {
  const next = { ...current, ...changes }
  if (Object.hasOwn(changes, 'locale') && !['en', 'es-ES', ...current.locales.map(item => item.locale)].includes(next.locale)) throw new Error('Invalid settings locale')
  if (['globalAssignMemory', 'globalMinMemory', 'globalMaxMemory'].some(key => Object.hasOwn(changes, key)) && next.globalAssignMemory === true && next.globalMaxMemory > 0 && next.globalMinMemory > next.globalMaxMemory) throw new Error('Invalid memory bounds')
  if ((Object.hasOwn(changes, 'httpProxy') || Object.hasOwn(changes, 'httpProxyEnabled')) && (next.httpProxyEnabled || next.httpProxy)) {
    if (/[\s\\]/.test(next.httpProxy)) throw new Error('Invalid proxy')
    let url: URL
    try { url = new URL(next.httpProxy) } catch { throw new Error('Invalid proxy') }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid proxy')
  }
}
