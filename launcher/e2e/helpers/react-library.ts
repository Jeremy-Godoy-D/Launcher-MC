import type { Page } from '@playwright/test'

/** Synthetic records created through the real service, only in the isolated E2E profile. */
export async function seedReactLibrary(page: Page) {
  const paths = await page.evaluate(async () => {
    const service = (window as any).serviceChannels.open('InstanceService')
    const paths: string[] = []
    for (const [name, minecraft, fabricLoader] of [
      ['Mi mundo', '1.21.1', ''],
      ['Fabric QA', '1.21.1', '0.16.0'],
      ['Bajo la superficie', '1.20.4', ''],
    ]) paths.push(await service.call('createInstance', { name, runtime: { minecraft, fabricLoader } }))
    localStorage.setItem('selectedInstancePath', paths[0])
    return paths
  })
  await page.reload()
  return paths
}
