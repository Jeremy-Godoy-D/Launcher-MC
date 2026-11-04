import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { completeOnboarding } from '../../helpers/tasks/onboarding'

test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })

test('Vue onboarding still completes using the confirmed and validated bootstrap contract', async ({ launcher }) => {
  await completeOnboarding(launcher, { skipAccount: true })
  await expect(launcher.main.getByTestId('setup-root')).toHaveCount(0)
  await expect(launcher.main.getByTestId('app-sidebar')).toBeVisible()
  expect(resolve(await readFile(join(launcher.appDataPath, 'LauncherMC', 'root'), 'utf8'))).toBe(resolve(launcher.gameDataPath))
})
