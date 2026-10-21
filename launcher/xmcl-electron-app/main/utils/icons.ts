import { isAbsolute, join } from 'path'
import rawIco from '../../icons/launchermc.ico'
import rawPng from '../../icons/launchermc.png'

const resolveIcon = (iconPath: string) => (isAbsolute(iconPath) ? iconPath : join(__dirname, iconPath))

export const darkIco = resolveIcon(rawIco)
export const lightIco = resolveIcon(rawIco)
export const darkIcon = resolveIcon(rawPng)
export const lightIcon = resolveIcon(rawPng)
export const darkTray = resolveIcon(rawPng)
export const lightTray = resolveIcon(rawPng)
