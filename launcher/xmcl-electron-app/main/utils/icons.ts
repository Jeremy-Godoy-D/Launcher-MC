import { isAbsolute, join } from 'path'
import rawIco from '../../../branding/copper/grimo.ico'
import rawPng from '../../../branding/copper/app-256.png'

const resolveIcon = (iconPath: string) => (isAbsolute(iconPath) ? iconPath : join(__dirname, iconPath))

export const darkIco = resolveIcon(rawIco)
export const lightIco = resolveIcon(rawIco)
export const darkIcon = resolveIcon(rawPng)
export const lightIcon = resolveIcon(rawPng)
export const darkTray = resolveIcon(rawPng)
export const lightTray = resolveIcon(rawPng)
