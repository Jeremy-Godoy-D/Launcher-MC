import type { StateData } from '@launcher/renderer-client'
import type { Settings } from '@xmcl/runtime-api/src/entities/setting'
import { parseInstanceSettingsChanges } from '@xmcl/runtime-api/src/util/instanceSettings'
import { launcherSettingsKeys, type LauncherSettingsChanges } from '@xmcl/runtime-api/src/util/launcherSettings'

export function globalSettingsForm(settings: StateData<Settings>) {
  return {
    java: settings.globalJava, assignMemory: settings.globalAssignMemory,
    minMemory: String(settings.globalMinMemory), maxMemory: String(settings.globalMaxMemory),
    vmOptions: [...settings.globalVmOptions], mcOptions: [...settings.globalMcOptions],
    width: settings.globalResolution.width === undefined ? '' : String(settings.globalResolution.width),
    height: settings.globalResolution.height === undefined ? '' : String(settings.globalResolution.height),
    fullscreen: settings.globalResolution.fullscreen ?? false,
    fastLaunch: settings.globalFastLaunch, hideLauncher: settings.globalHideLauncher, showLog: settings.globalShowLog,
    locale: settings.locale, apiSetsPreference: settings.apiSetsPreference,
    httpProxy: settings.httpProxy, httpProxyEnabled: settings.httpProxyEnabled,
    maxSockets: String(settings.maxSockets), maxAPISockets: String(settings.maxAPISockets),
    allowPrerelease: settings.allowPrerelease, autoDownload: settings.autoDownload, autoInstallOnAppQuit: settings.autoInstallOnAppQuit,
  }
}
export type GlobalSettingsForm = ReturnType<typeof globalSettingsForm>
export type GlobalField = keyof GlobalSettingsForm
export type GlobalDraft = { base: GlobalSettingsForm; values: GlobalSettingsForm }
export const globalDraft = (data: StateData<Settings>): GlobalDraft => {
  const values = globalSettingsForm(data)
  return { base: structuredClone(values), values }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const dirtyGlobalSettings = (draft: GlobalDraft) => (Object.keys(draft.values) as GlobalField[]).filter(key => !same(draft.base[key], draft.values[key]))
export function reconcileGlobalSettings(draft: GlobalDraft, data: StateData<Settings>): GlobalDraft {
  const incoming = globalSettingsForm(data), result = structuredClone(draft)
  for (const key of Object.keys(incoming) as GlobalField[]) if (same(draft.base[key], draft.values[key]) || same(incoming[key], draft.values[key])) {
    Reflect.set(result.base, key, incoming[key]); Reflect.set(result.values, key, incoming[key])
  }
  return result
}
export function invalidGlobalSetting(field: GlobalField): never { throw Object.assign(new Error('Invalid global setting'), { field }) }
function integer(value: string, field: GlobalField, min: number, max: number) {
  if (!/^\d+$/.test(value.trim())) invalidGlobalSetting(field)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < min || result > max) invalidGlobalSetting(field)
  return result
}
const gameFields = ['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'width', 'height', 'fullscreen', 'fastLaunch', 'hideLauncher', 'showLog'] as const
const nativeGameFields = ['globalJava', 'globalAssignMemory', 'globalMinMemory', 'globalMaxMemory', 'globalVmOptions', 'globalMcOptions', 'globalResolution', 'globalFastLaunch', 'globalHideLauncher', 'globalShowLog', 'globalDisableAuthlibInjector', 'globalDisableElyByAuthlib', 'globalSyncGameLanguage', 'globalPrependCommand', 'globalPreExecuteCommand', 'globalEnv'] as const
type NativeGame = Parameters<Settings['globalInstanceSetting']>[0]

/** Only changed controls are applied; commands, environment and unrelated preferences stay native. */
export function prepareGlobalSettings(draft: GlobalDraft, current: StateData<Settings>) {
  const dirty = dirtyGlobalSettings(draft), incoming = globalSettingsForm(current), values = structuredClone(draft.values)
  if (dirty.some(key => !same(incoming[key], draft.base[key]) && !same(incoming[key], values[key]))) throw Object.assign(new Error('Settings changed in another window'), { conflict: true })
  const changed = new Set(dirty)
  for (const group of [['assignMemory', 'minMemory', 'maxMemory'], ['width', 'height', 'fullscreen'], ['httpProxy', 'httpProxyEnabled']] as const) if (group.some(key => changed.has(key))) {
    if (group.some(key => !same(incoming[key], draft.base[key]) && !same(incoming[key], values[key]))) throw Object.assign(new Error('Settings changed in another window'), { conflict: true })
  }
  if (changed.has('locale') && !['en', 'es-ES', ...current.locales.map(item => item.locale)].includes(values.locale)) invalidGlobalSetting('locale')
  if (changed.has('apiSetsPreference') && !['', 'mojang', 'bmcl'].includes(values.apiSetsPreference)) invalidGlobalSetting('apiSetsPreference')
  if (changed.has('httpProxy') || changed.has('httpProxyEnabled')) {
    if (values.httpProxy || values.httpProxyEnabled) {
      if (values.httpProxy.length > 4096 || /[\s\\]/.test(values.httpProxy)) invalidGlobalSetting('httpProxy')
      let proxy: URL
      try { proxy = new URL(values.httpProxy) } catch { invalidGlobalSetting('httpProxy') }
      if (!['http:', 'https:'].includes(proxy.protocol) || !proxy.hostname || proxy.hash || proxy.search || proxy.pathname !== '/') invalidGlobalSetting('httpProxy')
    }
  }
  if (changed.has('maxSockets')) values.maxSockets = String(integer(values.maxSockets, 'maxSockets', 0, 256))
  if (changed.has('maxAPISockets')) values.maxAPISockets = String(integer(values.maxAPISockets, 'maxAPISockets', 0, 256))
  let game: NativeGame | undefined
  if (gameFields.some(key => changed.has(key))) {
    game = structuredClone(Object.fromEntries(nativeGameFields.map(key => [key, current[key]]))) as NativeGame
    const changes: Record<string, unknown> = {}
    for (const key of gameFields) if (changed.has(key)) {
      if (key === 'width' || key === 'height' || key === 'fullscreen') continue
      changes[key] = key === 'java' ? values.java || null : key === 'minMemory' || key === 'maxMemory' ? integer(values[key], key, 0, 2147483647) : values[key]
    }
    if (['width', 'height', 'fullscreen'].some(key => changed.has(key as GlobalField))) changes.resolution = {
      width: values.width.trim() ? integer(values.width, 'width', 1, 32768) : null,
      height: values.height.trim() ? integer(values.height, 'height', 1, 32768) : null,
      fullscreen: values.fullscreen, monitor: current.globalResolution.monitor ?? null,
    }
    let parsed: ReturnType<typeof parseInstanceSettingsChanges>
    try { parsed = parseInstanceSettingsChanges(changes) } catch (error) {
      const field = error && typeof error === 'object' && 'field' in error ? String(error.field) : ''
      invalidGlobalSetting(field === 'resolution' ? 'width' : gameFields.includes(field as typeof gameFields[number]) ? field as GlobalField : 'java')
    }
    if (('assignMemory' in changes || 'minMemory' in changes || 'maxMemory' in changes) && values.assignMemory === true && Number(values.maxMemory) > 0 && Number(values.minMemory) > Number(values.maxMemory)) invalidGlobalSetting('minMemory')
    for (const key of ['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'fastLaunch', 'hideLauncher', 'showLog'] as const) if (key in parsed) Reflect.set(game, `global${key[0].toUpperCase()}${key.slice(1)}`, parsed[key] ?? (key === 'java' ? '' : undefined))
    if (parsed.resolution) game.globalResolution = Object.fromEntries(Object.entries(parsed.resolution).filter(([, value]) => value !== null))
  }
  const changes: LauncherSettingsChanges = {}
  for (const key of launcherSettingsKeys) if (key.startsWith('global')) {
    const value = game?.[key as keyof NativeGame]
    if (game && !same(value, current[key])) Reflect.set(changes, key, value)
  } else if (changed.has(key as GlobalField)) Reflect.set(changes, key, key === 'maxSockets' || key === 'maxAPISockets' ? Number(values[key]) : values[key as keyof typeof values])
  const review = new Set(Object.keys(changes))
  for (const group of [['globalAssignMemory', 'globalMinMemory', 'globalMaxMemory'], ['httpProxy', 'httpProxyEnabled']] as const) if (group.some(key => review.has(key))) for (const key of group) review.add(key)
  const expected = Object.fromEntries([...review].map(key => [key, current[key as keyof LauncherSettingsChanges]]))
  return { dirty, values, game, edit: { expected: structuredClone(expected), changes } }
}
