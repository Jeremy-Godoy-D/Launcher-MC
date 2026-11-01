import { z } from 'zod'
import type { Instance } from '@xmcl/instance'

export const instanceSettingsKeys = ['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'resolution', 'server', 'fastLaunch', 'hideLauncher', 'showLog'] as const
export type InstanceSettingsKey = typeof instanceSettingsKeys[number]
const text = z.string().max(32768)
const snapshotArguments = z.array(text).max(4096).refine(values => values.reduce((size, value) => size + value.length, 0) <= 1024 * 1024)
const number = z.number().finite()
const resolution = z.object({ width: number.nullable(), height: number.nullable(), fullscreen: z.boolean().nullable(), monitor: text.nullable() }).strict()
const server = z.object({ host: text, port: number.nullable(), name: text.nullable() }).strict()
const snapshotSchema = z.object({
  java: text.nullable(), assignMemory: z.union([z.boolean(), z.literal('auto')]).nullable(),
  minMemory: number.nullable(), maxMemory: number.nullable(),
  vmOptions: snapshotArguments.nullable(), mcOptions: snapshotArguments.nullable(),
  resolution: resolution.nullable(), server: server.nullable(),
  fastLaunch: z.boolean().nullable(), hideLauncher: z.boolean().nullable(), showLog: z.boolean().nullable(),
}).strict()
export type InstanceSettingsSnapshot = z.infer<typeof snapshotSchema>
const cleanText = text.refine(value => !value.includes('\0'))
const argumentsSchema = z.array(cleanText).max(1024).refine(values => values.reduce((size, value) => size + value.length, 0) <= 256 * 1024)
const changesSchema = snapshotSchema.extend({
  java: cleanText.min(1).nullable(),
  minMemory: z.number().int().min(0).max(2147483647).nullable(),
  maxMemory: z.number().int().min(0).max(2147483647).nullable(),
  vmOptions: argumentsSchema.nullable(), mcOptions: argumentsSchema.nullable(),
  resolution: resolution.extend({ width: z.number().int().min(1).max(32768).nullable(), height: z.number().int().min(1).max(32768).nullable(), monitor: cleanText.nullable() }).nullable(),
  server: server.extend({ host: cleanText.refine(value => !!value.trim() && !/[\r\n]/.test(value)), port: z.number().int().min(1).max(65535).nullable(), name: cleanText.nullable() }).nullable(),
}).partial().strict()
export type InstanceSettingsChanges = z.infer<typeof changesSchema>
export interface EditInstanceSettingsOptions { instancePath: string; expected: InstanceSettingsSnapshot; changes: InstanceSettingsChanges }

export function invalidInstanceSettings(field?: string): never {
  throw Object.assign(new Error('Invalid instance launch setting'), { name: 'InstanceSettingsInvalid', ...(field && instanceSettingsKeys.includes(field as InstanceSettingsKey) ? { field } : {}) })
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) invalidInstanceSettings(String(result.error.issues[0]?.path[0] || ''))
  return result.data
}
export function parseInstanceSettingsChanges(value: unknown): InstanceSettingsChanges {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.values(value).some(item => item === undefined)) invalidInstanceSettings()
  return parse(changesSchema, value)
}
export const parseInstanceSettingsSnapshot = (value: unknown) => parse(snapshotSchema, value)

/** Canonical nullable fields survive IPC, while parsing makes private copies of nested data. */
export function instanceSettingsSnapshot(source: Partial<Record<InstanceSettingsKey, unknown>>): InstanceSettingsSnapshot {
  const result: Record<string, unknown> = Object.fromEntries(instanceSettingsKeys.map(key => [key, source[key] ?? null]))
  for (const [key, keys] of [['resolution', ['width', 'height', 'fullscreen', 'monitor']], ['server', ['host', 'port', 'name']]] as const) {
    const value = result[key]
    if (value && typeof value === 'object') result[key] = Object.fromEntries(keys.map(name => [name, Reflect.get(value, name) ?? null]))
  }
  return parseInstanceSettingsSnapshot(result)
}
export function instanceSettingsEdit(changes: InstanceSettingsChanges) {
  const result: Record<string, unknown> = { ...changes }
  for (const key of ['resolution', 'server'] as const) if (changes[key]) result[key] = Object.fromEntries(Object.entries(changes[key]).filter(([, value]) => value !== null))
  return result as Partial<{ [K in InstanceSettingsKey]: Instance[K] | null }>
}
export function instanceSettingsReviewKeys(changes: InstanceSettingsChanges) {
  const keys = new Set(Object.keys(changes) as InstanceSettingsKey[])
  if (['assignMemory', 'minMemory', 'maxMemory'].some(key => keys.has(key as InstanceSettingsKey))) for (const key of ['assignMemory', 'minMemory', 'maxMemory'] as const) keys.add(key)
  return [...keys]
}
