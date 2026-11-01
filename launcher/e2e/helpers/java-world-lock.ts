import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/** Actual Java NIO interop on a fixture world; this does not launch Minecraft. */
export async function javaWorldLock(world: string, mode: 'hold' | 'probe' = 'hold') {
  const javaHome = process.env.JAVA_HOME_17_X64 || process.env.JAVA_HOME
  const executable = javaHome ? join(javaHome, 'bin/java.exe') : 'java'
  const source = fileURLToPath(new URL('../fixtures/WorldSessionLock.java', import.meta.url))
  const child = spawn(executable, [source, join(world, 'session.lock'), mode], { windowsHide: true, stdio: 'pipe' })
  let stderr = '', stdout = ''
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-16384) })
  const closed = new Promise<number | null>(resolve => child.once('close', resolve))
  const timeout = setTimeout(() => child.kill(), 15000)
  try {
    const status = await new Promise<'LOCKED' | 'BUSY'>((resolve, reject) => {
      child.once('error', reject)
      child.stdout.on('data', data => {
        stdout += data
        if (stdout.includes('LOCKED')) resolve('LOCKED')
        else if (stdout.includes('BUSY')) resolve('BUSY')
      })
      void closed.then(code => reject(new Error(`Java lock fixture exited ${code}: ${stderr}`)))
    })
    clearTimeout(timeout)
    return { status, async release() {
      const deadline = setTimeout(() => child.kill(), 10000)
      try { child.stdin.end(); const code = await closed; if (code !== 0) throw new Error(`Java lock fixture failed ${code}: ${stderr}`) }
      finally { clearTimeout(deadline) }
    } }
  } catch (error) { child.stdin.end(); await closed; clearTimeout(timeout); throw error }
}
