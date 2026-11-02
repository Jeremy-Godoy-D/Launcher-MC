import type { Page } from '@playwright/test'

export async function selectSettingsCategory(page: Page, category: string) {
  const compact = page.getByTestId('settings-category-select')
  if (await compact.isVisible()) await compact.selectOption(category)
  else await page.getByTestId(`settings-category-${category}`).click()
}
