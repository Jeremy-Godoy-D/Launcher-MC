import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { seed: { name: 'Vue group anchor', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('Vue fallback preserves native groups and migrates only its selected instance after persistence', async ({ launcher, shell }) => {
  await shell.dismissTutorial()
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactMod(a, 'example', 'Alpha'); await makeReactMod(b, 'example', 'Beta')
  const legacy = { [a]: { 'example.jar': 'Legacy A' }, [b]: { 'example.jar.disabled': 'Legacy B' } }
  await writeFile(join(a, 'mod-groups.json'), '{}')
  await page.evaluate(({ legacy, path }) => { localStorage.setItem('modsGrouping', JSON.stringify(legacy)); localStorage.setItem('selectedInstancePath', path) }, { legacy, path: a })
  await page.reload(); await shell.dismissTutorial(); await shell.goto('/instance/mods')
  await expect(page.getByTestId('app-sidebar')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(a)
  await expect(page.getByText('Alpha', { exact: true }).first()).toBeVisible()
  expect(await readFile(join(a, 'mod-groups.json'), 'utf8')).toBe('{}')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  await expect(readFile(join(b, 'mod-groups.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await page.evaluate(path => localStorage.setItem('selectedInstancePath', path), b)
  await page.reload(); await shell.dismissTutorial(); await shell.goto('/instance/mods')
  await expect.poll(async () => JSON.parse(await readFile(join(b, 'mod-groups.json'), 'utf8').catch(() => '{}'))).toEqual({ 'Legacy B': { color: '', files: ['example.jar'] } })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual({ [a]: legacy[a] })
  expect(await readFile(join(a, 'mod-groups.json'), 'utf8')).toBe('{}')
})
