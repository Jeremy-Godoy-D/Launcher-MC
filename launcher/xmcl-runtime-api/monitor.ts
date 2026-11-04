import type { GameOutputIdentity } from './src/services/LaunchService'

export interface Monitor {
  on(event: 'minecraft-start', func: (event: {
    pid?: number
    version: string
    minecraft: string
    forge: string
    fabricLoader: string
  }) => void): void
  on(event: 'minecraft-window-ready', func: (event: { pid?: number }) => void): void
  on(event: 'minecraft-exit', func: (event: { pid?: number; code?: number; signal?: string; crashReport?: string; crashReportLocation?: string; errorLog: string }) => void): void
  on(event: 'minecraft-stdout', func: (event: GameOutputIdentity & { stdout: string }) => void): void
  on(event: 'minecraft-stderr', func: (event: GameOutputIdentity & { stderr: string }) => void): void
}
