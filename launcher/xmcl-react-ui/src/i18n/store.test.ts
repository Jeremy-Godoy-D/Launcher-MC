import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { load } from 'js-yaml'
import { compileMessages } from '../../i18n-compiler'
import { LocaleStore, type Messages } from './store'

const directory = new URL('../../../xmcl-keystone-ui/locales/', import.meta.url)
const read = (locale: string) => load(readFileSync(new URL(`${locale}.yaml`, directory), 'utf8')) as Messages
const compiled = (value: unknown) => compileMessages(value) as Messages
const requireVue = createRequire(new URL('../../../xmcl-keystone-ui/package.json', import.meta.url))
const { createI18n } = requireVue('vue-i18n')

describe('Intlify without Vue', () => {
  it('precompiles all 29 YAML sources and matches representative Vue messages', async () => {
    const files = readdirSync(directory).filter(file => file.endsWith('.yaml'))
    expect(files).toHaveLength(29)
    for (const file of files) {
      const locale = file.replace('.yaml', '')
      expect(() => compiled(read(locale))).not.toThrow()
    }
    const raw = { en: read('en'), 'es-ES': read('es-ES') }
    const store = new LocaleStore(compiled(raw.en), { 'es-ES': async () => compiled(raw['es-ES']) })
    for (const locale of ['en', 'es-ES']) {
      await store.setLocale(locale)
      const old = createI18n({ legacy: false, locale, fallbackLocale: 'en', missingWarn: false, fallbackWarn: false, messages: raw }).global
      for (const key of ['AppAddInstanceDialog.createTitle', 'HomeJavaIssueDialog.incompatibleJava', 'diagnosis.badInstall.name', 'setup.appearance.name']) {
        expect(store.t(key, { version: '1.20.4' })).toBe(old.t(key, { version: '1.20.4' }))
      }
      for (const count of [0, 1, 5]) expect(store.t('diagnosis.corruptedAssets.name', { name: 'Minecraft', count }, count)).toBe(old.t('diagnosis.corruptedAssets.name', { name: 'Minecraft', count }, count))
    }
  })

  it('handles named/list interpolation, linked messages, plurals and English fallback without eval', async () => {
    const english = compiled({ greeting: 'Hello {name}', list: '{0} + {1}', alias: '@:greeting', count: 'None | One | {count} files', fallback: 'English fallback' })
    const store = new LocaleStore(english, { 'es-ES': async () => compiled({ greeting: 'Hola {name}' }) })
    await store.setLocale('es-ES')
    const dynamicCode = vi.spyOn(globalThis, 'Function').mockImplementation(() => { throw new Error('Dynamic code forbidden') })
    try {
      expect(store.t('greeting', { name: '<script>' })).toBe('Hola <script>')
      expect(store.t('list', ['A', 'B'])).toBe('A + B')
      expect(store.t('alias', { name: 'Alex' })).toBe('Hello Alex')
      expect([0, 1, 3].map(count => store.t('count', { count }, count))).toEqual(['None', 'One', '3 files'])
      expect(store.t('fallback')).toBe('English fallback')
      expect(store.n(1234.5, { minimumFractionDigits: 2 })).toBe(new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(1234.5))
      const date = new Date('2026-10-24T12:00:00Z')
      const options = { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' } as const
      expect(store.d(date, options)).toBe(new Intl.DateTimeFormat('es-ES', options).format(date))
      expect(store.list(['Java', 'Fabric'])).toBe(new Intl.ListFormat('es-ES').format(['Java', 'Fabric']))
    } finally { dynamicCode.mockRestore() }
  })

  it('ignores obsolete loads, deduplicates them and permits retry after a failed chunk', async () => {
    let resolve!: (value: Messages) => void
    const arabic = vi.fn(() => new Promise<Messages>(done => { resolve = done }))
    const spanish = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(compiled({ hello: 'Hola' }))
    const store = new LocaleStore(compiled({ hello: 'Hello' }), { ar: arabic, 'es-ES': spanish })
    const first = store.setLocale('ar')
    const same = store.setLocale('ar')
    await store.setLocale('es-ES')
    expect(store.getSnapshot().error).toBeInstanceOf(Error)
    await store.setLocale('es-ES')
    resolve(compiled({ hello: 'مرحبا' }))
    await Promise.all([first, same])
    expect(arabic).toHaveBeenCalledTimes(1)
    expect(store.t('hello')).toBe('Hola')
    await store.setLocale('unknown')
    expect(store.t('hello')).toBe('Hello')
  })
})
