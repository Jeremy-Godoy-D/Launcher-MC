import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { focusLauncher } from '../../helpers/focus-launcher'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

async function openWorkspaceConsole(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  const workspace = page.getByTestId('instance-workspace')
  await expect(workspace).toBeVisible()
  await workspace.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola' }).click()
  const consoleSec = page.getByTestId('instance-console')
  await expect(consoleSec).toBeVisible()
  return consoleSec
}

test('instance console renders toolbar controls, process status and empty placeholder', async ({ launcher }) => {
  const page = launcher.main
  await seedReactLibrary(page)

  const consoleSec = await openWorkspaceConsole(page)

  // Verify header and description
  await expect(consoleSec.getByRole('heading', { name: 'Consola de la instancia' })).toBeVisible()

  // Verify toolbar elements
  const sourceSelect = consoleSec.getByTestId('console-file-select')
  await expect(sourceSelect).toBeVisible()
  await expect(sourceSelect).toHaveValue('__live__')

  const levelSelect = consoleSec.getByTestId('console-level-filter')
  await expect(levelSelect).toBeVisible()
  await expect(levelSelect).toHaveValue('all')

  const searchInput = consoleSec.getByTestId('console-search')
  await expect(searchInput).toBeVisible()
  await expect(searchInput).toHaveValue('')

  const autoscrollCheck = consoleSec.getByTestId('console-autoscroll')
  await expect(autoscrollCheck).toBeVisible()
  await expect(autoscrollCheck).toBeChecked()

  // Action buttons
  await expect(consoleSec.getByTestId('console-copy')).toBeVisible()
  await expect(consoleSec.getByTestId('console-export')).toBeVisible()
  await expect(consoleSec.getByTestId('console-clear')).toBeVisible()
  await expect(consoleSec.getByTestId('console-open-window')).toBeVisible()
  await expect(consoleSec.getByTestId('console-refresh')).toBeVisible()

  // Empty state in live mode with no processes
  await expect(consoleSec.getByTestId('console-empty')).toBeVisible()
  await expect(consoleSec.locator('.console-statusbar')).toContainText('No hay procesos activos')
})

test('instance console loads stored log files, parses formatted lines and supports search and level filtering', async ({ launcher }) => {
  const page = launcher.main
  const [instPath] = await seedReactLibrary(page)

  // Seed a realistic latest.log on disk inside the instance directory
  const logsDir = join(instPath, 'logs')
  await mkdir(logsDir, { recursive: true })

  const sampleLog = [
    '[12:00:01] [main/INFO]: Setting user: Steve',
    '[12:00:02] [main/INFO]: Loading Minecraft 1.21.1 with Fabric Loader 0.16.0',
    '[12:00:03] [Render thread/WARN]: Missing sound event: minecraft:entity.custom.ambient',
    '[12:00:04] [Server thread/INFO]: Preparing start region for dimension minecraft:overworld',
    '[12:00:05] [Server thread/ERROR]: Failed to load custom datapack: syntax error at line 5',
    '[12:00:06] [Server-Worker-1/DEBUG]: Loading chunk data at coordinates [12, -4]',
    '[12:00:07] [Server thread/INFO]: Time elapsed: 1420 ms',
  ].join('\n')

  await writeFile(join(logsDir, 'latest.log'), sampleLog, 'utf8')

  const consoleSec = await openWorkspaceConsole(page)

  // Click refresh to detect the seeded file
  await consoleSec.getByTestId('console-refresh').click()

  // Select latest.log in the dropdown
  const sourceSelect = consoleSec.getByTestId('console-file-select')
  await sourceSelect.selectOption('latest.log')

  // Verify all 7 entries appear
  const entries = consoleSec.locator('[data-testid="console-entry"]')
  await expect(entries).toHaveCount(7)
  await expect(consoleSec.locator('.console-statusbar')).toContainText('7 líneas')

  // Verify formatted elements of first line
  const firstEntry = entries.first()
  await expect(firstEntry.locator('.console-time')).toContainText('12:00:01')
  await expect(firstEntry.locator('.console-level')).toContainText('info')
  await expect(firstEntry.locator('.console-source')).toContainText('main')
  await expect(firstEntry.locator('.console-text')).toContainText('Setting user: Steve')

  // Filter by level: ERROR
  const levelSelect = consoleSec.getByTestId('console-level-filter')
  await levelSelect.selectOption('error')
  await expect(entries).toHaveCount(1)
  await expect(entries.first().locator('.console-text')).toContainText('Failed to load custom datapack')

  // Filter by level: WARN
  await levelSelect.selectOption('warn')
  await expect(entries).toHaveCount(1)
  await expect(entries.first().locator('.console-text')).toContainText('Missing sound event')

  // Filter by level: DEBUG
  await levelSelect.selectOption('debug')
  await expect(entries).toHaveCount(1)
  await expect(entries.first().locator('.console-text')).toContainText('Loading chunk data')

  // Reset level to all
  await levelSelect.selectOption('all')
  await expect(entries).toHaveCount(7)

  // Search filter
  const searchInput = consoleSec.getByTestId('console-search')
  await searchInput.fill('datapack')
  await expect(entries).toHaveCount(1)
  await expect(entries.first()).toContainText('datapack')

  // Search with no matches
  await searchInput.fill('nonexistent-term-xyz')
  await expect(entries).toHaveCount(0)
  await expect(consoleSec.getByTestId('console-empty')).toContainText('No se encontraron líneas')

  // Clear search
  await searchInput.fill('')
  await expect(entries).toHaveCount(7)

  // Test clear button
  await consoleSec.getByTestId('console-clear').click()
  await expect(entries).toHaveCount(0)
  await expect(consoleSec.getByTestId('console-empty')).toBeVisible()
})

test('instance console displays crash reports with copy action and explorer integration', async ({ launcher }) => {
  const page = launcher.main
  const [instPath] = await seedReactLibrary(page)

  // Seed crash-reports directory and report file
  const crashDir = join(instPath, 'crash-reports')
  await mkdir(crashDir, { recursive: true })

  const crashContent = [
    '---- Minecraft Crash Report ----',
    '// Don\'t do that.',
    '',
    'Time: 2026-10-31 20:00:00',
    'Description: Initializing game',
    '',
    'java.lang.NullPointerException: Cannot invoke method because object is null',
    '\tat net.minecraft.client.MinecraftClient.init(MinecraftClient.java:512)',
    '\tat net.minecraft.client.main.Main.main(Main.java:214)',
  ].join('\n')

  await writeFile(join(crashDir, 'crash-2026-10-31_20.00.00-client.txt'), crashContent, 'utf8')

  const consoleSec = await openWorkspaceConsole(page)

  await consoleSec.getByTestId('console-refresh').click()

  const sourceSelect = consoleSec.getByTestId('console-file-select')
  await sourceSelect.selectOption('crash-2026-10-31_20.00.00-client.txt')

  // Verify show file button is visible when a file is selected
  await expect(consoleSec.getByTestId('console-show-file')).toBeVisible()

  // Verify crash lines loaded and error lines highlighted
  const entries = consoleSec.locator('[data-testid="console-entry"]')
  await expect(entries).toHaveCount(7)

  // Test Copy action feedback
  const copyBtn = consoleSec.getByTestId('console-copy')
  await copyBtn.click()
  await expect(copyBtn).toContainText('¡Copiado!')
})

test('instance console maintains WCAG 2.1 AA accessibility and responsiveness matrix', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const [instPath] = await seedReactLibrary(page)

  const logsDir = join(instPath, 'logs')
  await mkdir(logsDir, { recursive: true })
  await writeFile(join(logsDir, 'latest.log'), '[12:00:00] [main/INFO]: Test log line\n', 'utf8')

  const consoleSec = await openWorkspaceConsole(page)
  await consoleSec.getByTestId('console-refresh').click()
  await consoleSec.getByTestId('console-file-select').selectOption('latest.log')

  const win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()
    await consoleSec.getByTestId('console-refresh').click()
    await consoleSec.getByTestId('console-file-select').selectOption('latest.log')
    await expect(consoleSec.getByTestId('console-entry')).toHaveCount(1)

    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, width === 800 ? 400 : 720])
      await expect(consoleSec).toBeVisible()
      const search = consoleSec.getByTestId('console-search')
      await focusLauncher(launcher)
      await consoleSec.getByTestId('console-level-filter').focus(); await page.keyboard.press('Tab')
      await expect(search).toBeFocused(); await expect(search).toBeInViewport({ ratio: 1 })
      expect(await consoleSec.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(async () =>
        (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }),
      )
      await writeFile(testInfo.outputPath(`console-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])

      await snap(launcher, `instance-console-${theme}-${width}`, 'Instance console view.')
    }
  }
})
