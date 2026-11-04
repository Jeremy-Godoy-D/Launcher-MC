import { expect, type Locator } from '@playwright/test'
import type { LauncherFixture } from '../fixtures/launcher'

/** Activate the isolated native window without choosing a DOM focus target. */
export async function focusLauncher(launcher: LauncherFixture) {
  const win = await launcher.app.browserWindow(launcher.main)
  await expect.poll(() => win.evaluate(win => {
    if (win.isMinimized()) win.restore()
    win.show(); win.focus(); win.webContents.focus()
    return win.isVisible() && win.isFocused() && win.webContents.isFocused()
  })).toBe(true)
  await expect.poll(() => launcher.main.evaluate(() => document.hasFocus())).toBe(true)
}

/** Keep native activation, keyboard focus and complete ancestor clipping checks together. */
export async function activateLauncherControl(launcher: LauncherFixture, control: Locator) {
  await focusLauncher(launcher)
  await expect(control).toBeVisible(); await expect(control).toBeEnabled()
  await control.focus(); await expect(control).toBeFocused()
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect()
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect()
      if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) { left = Math.max(left, box.left + parent.clientLeft); right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth) }
      if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) { top = Math.max(top, box.top + parent.clientTop); bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight) }
    }
    return rect.width > 0 && rect.height > 0 && rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom
  })).toBe(true)
  await control.press('Enter')
}
