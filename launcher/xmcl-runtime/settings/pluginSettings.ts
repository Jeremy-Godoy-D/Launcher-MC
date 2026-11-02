import { SettingSchema, Settings } from '@xmcl/runtime-api'
import { AggregateExecutor } from '@xmcl/utils'
import { readJson } from 'fs-extra'
import { writeFile as writeAtomically } from 'atomically'
import { type EditLauncherSettings, launcherSettingsConflict, parseLauncherSettingsEdit, validateLauncherSettings } from '@xmcl/runtime-api/src/util/launcherSettings'
import { join } from 'path'
import { LauncherAppPlugin } from '~/app'
import { ServiceStateManager } from '~/service'
import { kEditSettings, kSettings } from './settings'

export const pluginSettings: LauncherAppPlugin = async (app) => {
  const stateManager = await app.registry.get(ServiceStateManager)
  const state = stateManager.registerStatic(new Settings(), 'settings')
  const logger = app.getLogger('Settings')
  const settingJsonPath = join(app.appDataPath, 'setting.json')

  let tail = Promise.resolve(), applying = false
  const serialize = () => JSON.stringify(SettingSchema.parse(state), null, 2)
  const enqueue = (operation: () => Promise<void>) => {
    const next = tail.catch(() => {}).then(operation)
    tail = next
    return next
  }
  const edit = async (options: EditLauncherSettings) => {
    const input = parseLauncherSettingsEdit(options)
    return enqueue(async () => {
      for (const key of input.review) if (JSON.stringify(state[key]) !== JSON.stringify(input.expected[key])) throw launcherSettingsConflict()
      validateLauncherSettings(state, input.changes)
      const before = serialize(), config = { ...JSON.parse(before), ...input.changes }
      await writeAtomically(settingJsonPath, JSON.stringify(config, null, 2))
      // A legacy mutation can arrive during disk I/O; preserve it and require a fresh review.
      if (serialize() !== before) { await writeAtomically(settingJsonPath, serialize()); throw launcherSettingsConflict() }
      applying = true
      try { state.config(config) } finally { applying = false }
    })
  }

  const saver = new AggregateExecutor<void, void>(() => { }, async () => {
    try {
      await enqueue(() => writeAtomically(settingJsonPath, serialize()))
    } catch (e) {
      // Best-effort: do NOT propagate as an unhandled rejection.
      // This saver runs on every state change; if writeJson fails
      // (EPERM/EBUSY/EROFS because of OneDrive sync, antivirus,
      // read-only mount on Linux, ...), reporting every retry as a
      // trackException creates a per-user storm and we still cannot
      // recover from the underlying environment issue. The next state
      // change re-triggers the saver, so transient locks self-heal.
      logger.warn(`Fail to save ${settingJsonPath}`)
      logger.warn(e as Error)
    }
  }, 1000)

  app.registryDisposer(async () => {
    await saver.flush()
    await tail.catch(() => {})
  })

  const normalizeLocale = (locale: string) => {
    locale = locale || app.host.getLocale()
    if (locale.startsWith('en')) {
      locale = 'en'
    }
    return locale
  }

  readJson(settingJsonPath).catch(() => ({})).then((rawData) => {
    // SettingSchema uses .catch() for each field, so invalid fields fallback to defaults automatically
    const data = SettingSchema.parse(rawData)
    data.locale = normalizeLocale(data.locale)
    state.config(data)
  }).catch((e) => {
    logger.error(e)
    // Still normalize locale with defaults when everything fails
    const data = SettingSchema.parse({})
    data.locale = normalizeLocale(data.locale)
    state.config(data)
  }).finally(() => {
    app.registry.register(kSettings, state)
    app.registry.register(kEditSettings, edit)
    state.subscribeAll(() => {
      if (!applying) saver.push()
    })
  })
}
