import { compile, createCoreContext, datetime, fallbackWithLocaleChain, number, registerLocaleFallbacker, registerMessageCompiler, registerMessageResolver, resolveValue, translate, type LocaleMessage } from '@intlify/core-base'

registerMessageCompiler(compile)
registerMessageResolver(resolveValue)
registerLocaleFallbacker(fallbackWithLocaleChain)
export type Messages = LocaleMessage
type Snapshot = Readonly<{ locale: string; loading: boolean; error?: Error; revision: number }>

export class LocaleStore {
  private context
  private listeners = new Set<() => void>()
  private requests = new Map<string, Promise<Messages>>()
  private generation = 0
  private snapshot: Snapshot = Object.freeze({ locale: 'en', loading: false, revision: 0 })

  constructor(english: Messages, private loaders: Record<string, () => Promise<Messages>>) {
    this.context = createCoreContext({ locale: 'en', fallbackLocale: 'en', messages: { en: english } as Record<string, Messages>, missingWarn: false, fallbackWarn: false })
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(update: Partial<Snapshot>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...update, revision: this.snapshot.revision + 1 })
    for (const listener of this.listeners) listener()
  }

  setLocale = async (requested: string) => {
    const locale = requested === 'en' || Object.hasOwn(this.loaders, requested) ? requested : 'en'
    if (locale === this.snapshot.locale && !this.snapshot.loading && !this.snapshot.error) return
    const generation = ++this.generation
    this.publish({ loading: true, error: undefined })
    try {
      if (!this.context.messages[locale]) {
        let request = this.requests.get(locale)
        if (!request) {
          request = this.loaders[locale]()
          this.requests.set(locale, request)
        }
        this.context.messages[locale] = await request
      }
      if (generation !== this.generation) return
      this.context.locale = locale
      this.publish({ locale, loading: false, error: undefined })
    } catch (cause) {
      this.requests.delete(locale)
      if (generation === this.generation) this.publish({ loading: false, error: new Error('No se pudo cargar el idioma', { cause }) })
    }
  }

  t = (key: string, values: Record<string, unknown> | unknown[] = {}, plural?: number) => String(Array.isArray(values)
    ? translate(this.context, key, values, { plural })
    : translate(this.context, key, values, { plural }))
  n = (value: number, options: Intl.NumberFormatOptions = {}) => String(number(this.context, value, options))
  d = (value: number | Date, options: Intl.DateTimeFormatOptions = {}) => String(datetime(this.context, value, options))
  list = (values: string[], options: Intl.ListFormatOptions = {}) => new Intl.ListFormat(this.snapshot.locale, options).format(values)
}
