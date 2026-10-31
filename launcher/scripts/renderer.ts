import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import targets from './renderer-targets.json'

export function rendererTarget(value = process.env.LAUNCHER_RENDERER) {
  const name = value ?? targets.default
  if (name !== 'vue' && name !== 'react')
    throw new Error(`Invalid LAUNCHER_RENDERER: ${name}; expected vue or react`)
  return { name, ...targets[name] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2]
  if (command !== 'build' && command !== 'dev') throw new Error('Expected renderer build or dev')
  const target = rendererTarget()
  const windows = process.platform === 'win32'
  const child = spawn(
    windows ? 'cmd.exe' : 'pnpm',
    windows
      ? ['/d', '/s', '/c', `pnpm --prefix ${target.package} ${command}`]
      : ['--prefix', target.package, command],
    {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  child.once('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.once('exit', (code) => {
    process.exitCode = code ?? 1
  })
}
