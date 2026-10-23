import { describe, expect, test } from 'vitest'
import { migrateAuroraTheme } from './auroraTheme'
import type { UIThemeDataV1 } from '@/composables/theme'

const defaults = { colors: { darkPrimaryColor: '#56dbab', darkBackground: '#071311ff' }, backgroundType: 'bubbles' } as UIThemeDataV1
describe('Aurora upgrade', () => {
  test('upgrades shipped dark colors without changing light data or custom media', () => {
    const theme = { colors: { darkPrimaryColor: '#e06d53', darkBackground: '#0c0e12ff', lightPrimaryColor: '#123456' }, backgroundType: 'image', backgroundImage: { url: 'local.png' } } as UIThemeDataV1
    expect(migrateAuroraTheme(theme, defaults)).toBe(true)
    expect(theme.colors.darkBackground).toBe('#071311ff')
    expect(theme.colors.lightPrimaryColor).toBe('#123456')
    expect(theme.backgroundImage?.url).toBe('local.png')
    expect(theme.backgroundType).toBe('image')
    expect(migrateAuroraTheme(theme, defaults)).toBe(false)
  })
  test('preserves a custom theme', () => {
    const theme = { colors: { darkPrimaryColor: '#abcdef' }, backgroundType: 'none' } as UIThemeDataV1
    expect(migrateAuroraTheme(theme, defaults)).toBe(false)
    expect(theme.backgroundType).toBe('none')
  })
})
