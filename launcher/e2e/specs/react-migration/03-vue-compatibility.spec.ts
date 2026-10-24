import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Vue compatibility QA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('Vue default keeps the existing-instance launcher shell', async ({ launcher, shell }) => {
  await shell.dismissTutorial()
  await shell.goto('/')
  await expect(launcher.main.getByTestId('launch-center')).toBeVisible()
  await expect(launcher.main.getByTestId('app-sidebar')).toBeVisible()
  await expect(launcher.main.getByTestId('react-prototype')).toHaveCount(0)
  await launcher.main.evaluate(async () => {
    await (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue client QA', runtime: { minecraft: '1.20.4' } })
  })
  await shell.goto('/me')
  await expect(launcher.main.getByTestId('instance-card-Vue client QA')).toBeVisible()
  await snap(launcher, 'vue-default-existing', 'Renderer Vue predeterminado con instancia sintética, sin lanzar Minecraft.')
})
