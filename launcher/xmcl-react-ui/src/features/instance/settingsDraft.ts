import { instanceSettingsKeys, instanceSettingsReviewKeys, invalidInstanceSettings, parseInstanceSettingsChanges, type InstanceSettingsChanges, type InstanceSettingsKey, type InstanceSettingsSnapshot } from '@xmcl/runtime-api/src/util/instanceSettings'

export type InstanceSettingsForm = Omit<InstanceSettingsSnapshot, 'java' | 'minMemory' | 'maxMemory' | 'resolution' | 'server'> & {
  java: string; minMemory: string; maxMemory: string
  resolution: { enabled: boolean; width: string; height: string; fullscreen: boolean | null; monitor: string }
  server: { enabled: boolean; host: string; port: string; name: string }
}
export interface InstanceSettingsDraft { base: InstanceSettingsSnapshot; values: InstanceSettingsForm }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const numeric = (value: number | null | undefined) => value === null || value === undefined ? '' : String(value)
export function instanceSettingsForm(snapshot: InstanceSettingsSnapshot): InstanceSettingsForm {
  return { ...snapshot, java: snapshot.java ?? '', minMemory: numeric(snapshot.minMemory), maxMemory: numeric(snapshot.maxMemory), vmOptions: snapshot.vmOptions?.slice() ?? null, mcOptions: snapshot.mcOptions?.slice() ?? null,
    resolution: { enabled: snapshot.resolution !== null, width: numeric(snapshot.resolution?.width), height: numeric(snapshot.resolution?.height), fullscreen: snapshot.resolution?.fullscreen ?? null, monitor: snapshot.resolution?.monitor ?? '' },
    server: { enabled: snapshot.server !== null, host: snapshot.server?.host ?? '', port: numeric(snapshot.server?.port), name: snapshot.server?.name ?? '' } }
}
export const createInstanceSettingsDraft = (base: InstanceSettingsSnapshot): InstanceSettingsDraft => ({ base, values: instanceSettingsForm(base) })
export function dirtyInstanceSettings(draft: InstanceSettingsDraft) {
  const initial = instanceSettingsForm(draft.base)
  return instanceSettingsKeys.filter(key => !same(draft.values[key], initial[key]))
}
function number(value: string, field: InstanceSettingsKey) {
  if (!value.trim()) return null
  if (!/^\d{1,10}$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) invalidInstanceSettings(field)
  return Number(value)
}
export function instanceSettingsChanges(draft: InstanceSettingsDraft): InstanceSettingsChanges {
  const result: Record<string, unknown> = {}, { base, values } = draft, initial = instanceSettingsForm(base)
  for (const key of dirtyInstanceSettings(draft)) {
    if (key === 'java') result.java = values.java || null
    else if (key === 'minMemory' || key === 'maxMemory') result[key] = number(values[key], key)
    else if (key === 'resolution') result.resolution = values.resolution.enabled ? {
      width: number(values.resolution.width, key), height: number(values.resolution.height, key), fullscreen: values.resolution.fullscreen,
      monitor: values.resolution.monitor === initial.resolution.monitor ? base.resolution?.monitor ?? null : values.resolution.monitor || null,
    } : null
    else if (key === 'server') result.server = values.server.enabled ? {
      host: values.server.host.trim(), port: number(values.server.port, key),
      name: values.server.name === initial.server.name ? base.server?.name ?? null : values.server.name,
    } : null
    else result[key] = values[key]
  }
  const changes = parseInstanceSettingsChanges(result)
  for (const key of Object.keys(changes) as InstanceSettingsKey[]) if (same(changes[key], base[key])) delete changes[key]
  return changes
}
function reviewed(draft: InstanceSettingsDraft) {
  return instanceSettingsReviewKeys(Object.fromEntries(dirtyInstanceSettings(draft).map(key => [key, null])))
}
export function reconcileInstanceSettings(draft: InstanceSettingsDraft, incoming: InstanceSettingsSnapshot): InstanceSettingsDraft {
  const touched = new Set(reviewed(draft)), nextForm = instanceSettingsForm(incoming), base = { ...draft.base }, values = { ...draft.values }
  const memory = ['assignMemory', 'minMemory', 'maxMemory'] as const
  const memoryMatches = memory.every(key => same(draft.values[key], nextForm[key]))
  for (const key of instanceSettingsKeys) if (!touched.has(key) || (memory.includes(key as typeof memory[number]) ? memoryMatches : same(draft.values[key], nextForm[key]))) {
    Reflect.set(base, key, incoming[key]); Reflect.set(values, key, nextForm[key])
  }
  return { base, values }
}
export function conflictingInstanceSettings(draft: InstanceSettingsDraft, incoming: InstanceSettingsSnapshot) {
  return reviewed(draft).filter(key => !same(draft.base[key], incoming[key]))
}
