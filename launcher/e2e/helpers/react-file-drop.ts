import type { Page } from '@playwright/test'

/** Files come from Chromium's native file input; the real preload resolves their paths. */
export async function dropNativeFiles(page: Page, paths: string[]) {
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.id = 'owned-drop-input'; input.hidden = true; document.body.append(input) })
  try {
    await page.locator('#owned-drop-input').setInputFiles(paths)
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#owned-drop-input')!, dataTransfer = new DataTransfer()
      for (const file of Array.from(input.files!)) dataTransfer.items.add(file)
      document.dispatchEvent(new DragEvent('dragenter', { dataTransfer, bubbles: true, cancelable: true }))
      document.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
    })
  } finally { await page.locator('#owned-drop-input').evaluate(input => input.remove()) }
}
