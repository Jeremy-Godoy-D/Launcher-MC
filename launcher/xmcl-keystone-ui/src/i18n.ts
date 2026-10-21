// import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'
// @ts-ignore
import en from '../locales/en.yaml'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  silentTranslationWarn: true,
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en,
  },
})

