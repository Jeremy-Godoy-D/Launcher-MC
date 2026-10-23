import { test, expect } from '../../helpers/scratch'
import { completeOnboarding } from '../../helpers/tasks/onboarding'
import { createInstance } from '../../helpers/tasks/createInstance'

test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })

test('new player can add a local account and create an instance through the full flow', async ({ launcher, shell }) => {
  test.setTimeout(120_000)
  await completeOnboarding(launcher, { username: 'AuroraQA' })
  await createInstance(launcher, { name: 'Aurora Vanilla QA', minecraft: '1.20.4' })
  await expect(shell.instanceItems.filter({ hasText: 'Aurora Vanilla QA' })).toBeVisible()
  await shell.goto('/accounts')
  await expect(launcher.main.getByText('AuroraQA', { exact: true }).first()).toBeVisible()
})
