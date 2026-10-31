import { dirname, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('all three shipped Vanilla clips decode, only the next poster is preloaded and old sources are released', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const additional = await page.evaluate(async root => {
    const service = (window as any).serviceChannels.open('InstanceService'), paths: string[] = []
    for (const letter of ['a', 'b', 'c']) paths.push(await service.call('createInstance', { path: `${root}/ambient-${letter}`, name: `Ambient ${letter}`, runtime: { minecraft: '1.21.1' } }))
    return paths
  }, dirname(paths[0]).replaceAll('\\', '/'))
  const win = await launcher.app.browserWindow(page), scenes = new Set<string>(), records: unknown[] = []
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  for (const path of additional) {
    await page.evaluate(path => localStorage.setItem('selectedInstancePath', path), path); await page.reload()
    await page.getByTestId('nav-home').click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByTestId('nav-home').focus(); await page.mouse.move(20, 20)
    await win.evaluate(win => { win.show(); win.focus(); win.webContents.focus() })
    const video = page.locator('video')
    await expect(video).toHaveCount(1)
    await expect.poll(() => video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.15)
    const record = await video.evaluate((video: HTMLVideoElement) => ({ scene: video.dataset.scene!, src: video.currentSrc, poster: video.poster, duration: video.duration, width: video.videoWidth, height: video.videoHeight, muted: video.muted }))
    scenes.add(record.scene); records.push(record)
    expect(record).toMatchObject({ width: 1280, height: 720, duration: 12, muted: true })
    expect(record.src).toMatch(/^http:\/\/xmcl\.runtime\/assets\/vanilla-(caves|nether|end)-[^/]+\.mp4$/)
    await expect(page.locator('link[data-ambient-preload]')).toHaveCount(1)
    await expect(page.locator('link[rel="preload"][as="video"]')).toHaveCount(0)
    await page.evaluate(() => { (window as any).__previousAmbient = document.querySelector('video') })
    await page.getByTestId('nav-library').click()
    await expect(page.locator('video')).toHaveCount(0)
    expect(await page.evaluate(() => {
      const video = (window as any).__previousAmbient as HTMLVideoElement
      return { connected: video.isConnected, src: video.getAttribute('src'), paused: video.paused }
    })).toEqual({ connected: false, src: null, paused: true })
    await expect(page.locator('link[data-ambient-preload]')).toHaveCount(0)
  }
  expect([...scenes].sort()).toEqual(['end', 'nether', 'overworld'])
  expect(errors).toEqual([])
  await writeFile(testInfo.outputPath('ambient-decode.json'), JSON.stringify(records, null, 2))
})

test('a scrolled-out ambient pauses and returns; performance, disabled video and decode failure preserve a usable poster', async ({ launcher }) => {
  const page = launcher.main
  await seedReactLibrary(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const win = await launcher.app.browserWindow(page)
  await win.evaluate(win => { win.setContentSize(800, 400); win.show(); win.focus(); win.webContents.focus() })
  await page.getByTestId('nav-home').focus(); await page.mouse.move(20, 20)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.15)
  await page.locator('.page-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => page.getByTestId('react-prototype').evaluate(element => JSON.parse(element.getAttribute('data-motion-state')!).regionVisible)).toBe(false)
  await expect.poll(() => video.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await page.locator('.page-scroll').evaluate(element => { element.scrollTop = 0 })
  await expect.poll(() => video.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false)
  await page.getByTestId('nav-settings').click(); await page.getByRole('checkbox', { name: 'Modo rendimiento', exact: true }).check()
  await page.getByTestId('nav-home').click()
  await expect.poll(() => video.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await expect(page.locator('link[data-ambient-preload]')).toHaveCount(0)
  await page.getByTestId('nav-settings').click(); await page.getByRole('checkbox', { name: 'Modo rendimiento', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Vídeo ambiental', exact: true }).uncheck()
  await page.getByTestId('nav-home').click(); await expect(video).toHaveCount(0)
  await expect(page.getByTestId('featured-play')).toBeEnabled()
  await page.getByTestId('nav-settings').click(); await page.getByRole('checkbox', { name: 'Vídeo ambiental', exact: true }).check()
  await page.getByTestId('nav-home').click()
  const corrupt = await video.evaluate((video: HTMLVideoElement) => {
    const url = URL.createObjectURL(new Blob(['invalid local MP4'], { type: 'video/mp4' }))
    video.src = url; video.load()
    return url
  })
  await expect(video).toHaveAttribute('data-error', 'true')
  await expect(video).toHaveCSS('opacity', '0')
  await expect.poll(() => page.locator('.ambient img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 100)).toBe(true)
  await expect(page.getByTestId('featured-play')).toBeEnabled()
  await page.evaluate(url => URL.revokeObjectURL(url), corrupt)
})
