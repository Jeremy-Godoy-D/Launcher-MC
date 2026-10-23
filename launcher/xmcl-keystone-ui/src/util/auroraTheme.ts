import type { UIThemeDataV1 } from '@/composables/theme'

/** Upgrade the shipped beta.3 theme, leaving user colors and light themes intact. */
export function migrateAuroraTheme(theme: UIThemeDataV1, defaults: UIThemeDataV1): boolean {
  if (theme.colors.darkPrimaryColor.toLowerCase() !== '#e06d53') return false
  const previous: Partial<UIThemeDataV1['colors']> = {
    darkAppBarColor: '#0c0e12', darkSideBarColor: '#12151c', darkPrimaryColor: '#e06d53',
    darkBackground: '#0c0e12', darkSuccessColor: '#3b9b78', darkAccentColor: '#3b9b78', darkCardColor: '#171b24',
  }
  for (const key of Object.keys(previous) as (keyof UIThemeDataV1['colors'])[]) {
    if (theme.colors[key]?.toLowerCase().replace(/ff$/, '').slice(0, 7) === previous[key]) theme.colors[key] = defaults.colors[key]
  }
  if (theme.backgroundType === 'none' && !theme.backgroundImage && !theme.backgroundImageDark) theme.backgroundType = defaults.backgroundType
  return true
}
