import { quoteWindowsArgument } from './windowsCommand'
import { win32 } from 'node:path'

export function getWindowsUpdateArgs(options: {
  target: string
  source: string
  sha256: string
  pid: number
  executable: string
  args: string[]
  cwd: string
  errorLog: string
}): string[] {
  if (!/^[a-f\d]{64}$/i.test(options.sha256) || !Number.isSafeInteger(options.pid) || options.pid < 1) throw new Error('Invalid update verification data')
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$target = ${literal(options.target)}
$source = ${literal(options.source)}
$staging = $target + '.updating'
$expected = ${literal(options.sha256)}
$exited = $false
$status = 0
$phase = 'wait-for-exit'
function Get-UpdateHash([string] $path) {
  $stream = [IO.File]::OpenRead($path)
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $hash.Dispose() }
}
try {
  $launcher = Get-Process -Id ${options.pid} -ErrorAction SilentlyContinue
  if ($launcher -and -not $launcher.WaitForExit(30000)) { throw 'Launcher still running' }
  $exited = $true
  $phase = 'verify-source'
  $sourceHash = Get-UpdateHash $source
  if ($sourceHash -ne $expected) { throw 'Update integrity check failed' }
  $phase = 'stage'
  [IO.File]::Copy($source, $staging, $true)
  if ((Get-UpdateHash $staging) -ne $expected) { throw 'Staged integrity check failed' }
  $phase = 'replace'
  [IO.File]::Replace($staging, $target, $target + '.previous')
} catch {
  $status = 1
  [IO.File]::WriteAllText(${literal(options.errorLog)}, ('Update could not be applied. The previous launcher was preserved. Phase: ' + $phase + '; error: ' + $_.Exception.GetBaseException().HResult))
} finally {
  if ([IO.File]::Exists($staging)) { [IO.File]::Delete($staging) }
  if ($exited) {
    Start-Process -FilePath ${literal(options.executable)} ${options.args.length ? '-ArgumentList ' + literal(options.args.map(quoteWindowsArgument).join(' ')) : ''} -WorkingDirectory ${literal(options.cwd)} -WindowStyle Hidden
  }
}
exit $status
`
  return [win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}
