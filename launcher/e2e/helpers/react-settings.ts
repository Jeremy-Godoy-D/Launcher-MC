import { expect, type Page } from '@playwright/test'

export async function selectSettingsCategory(page: Page, category: string) {
  await expect(page.getByTestId('global-settings')).toBeVisible()
  const compact = page.getByTestId('settings-category-select')
  if (await compact.isVisible()) await compact.selectOption(category)
  else await page.getByTestId(`settings-category-${category}`).click()
}
