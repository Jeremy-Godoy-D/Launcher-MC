import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const retiredRuntime = /\/xmcl-runtime\/(?:agent|bedrock|peer|presence|remoteServer|collection|xmclAccount|theme)\/|\/xmcl-runtime\/(?:instance\/(?:InstanceBlueprintsService|InstanceThemeService)|user\/MinecraftFriendsService|market\/BlueprintMarketService|app\/LauncherAppManager)\.ts$/
const retiredDependency = /\/node_modules\/(?:ssh2|@earendil-works\/pi-ai|@azure\/monitor-opentelemetry-exporter)\//
const vueRuntime = /\/node_modules\/(?:vue|vue-router|vuetify|@vue\/[^/]+)\//
const normalize = value => value.replaceAll('\\', '/')

export function auditCoreGraph(metas, renderer) {
  const native = metas.flatMap(({ name, data }) => Object.values(data.outputs ?? {}).flatMap(output => Object.entries(output.inputs ?? {}).filter(([, item]) => item.bytesInOutput > 0).map(([id, item]) => ({ meta: name, id: normalize(id), bytes: item.bytesInOutput }))))
  const ui = renderer.modules?.filter(item => item.bytes > 0).map(item => ({ ...item, id: normalize(item.id) })) ?? []
  if (!native.some(item => item.id.includes('/xmcl-runtime/app/BaseService.ts')) || !ui.some(item => item.id.includes('/react-dom/'))) throw new Error('Complete native and React build graphs are required')
  const failures = [...native.filter(item => retiredRuntime.test(item.id) || retiredDependency.test(item.id) || vueRuntime.test(item.id)), ...ui.filter(item => vueRuntime.test(item.id) || retiredDependency.test(item.id))]
  return { passed: failures.length === 0, nativeModules: native.length, rendererModules: ui.length, failures }
}

export async function checkCoreGraph(root, deskGap = false) {
  const host = join(root, deskGap ? 'deskgap-app' : 'xmcl-electron-app'), dist = join(host, 'dist')
  const metaFiles = [join(host, 'meta.json'), ...(await readdir(dist)).filter(name => name.endsWith('-meta.json')).map(name => join(dist, name))]
  const metas = await Promise.all(metaFiles.map(async name => ({ name, data: JSON.parse(await readFile(name, 'utf8')) })))
  const renderer = JSON.parse(await readFile(join(root, 'xmcl-react-ui/dist/distribution-graph.json'), 'utf8'))
  const result = auditCoreGraph(metas, renderer)
  const entries = await readdir(dist)
  for (const name of entries) if (/^(?:browse|indexTogether|multiplayerRtc|multiplayerNetworkDiagnostics)(?:-preload)?\.(?:js|cjs)$/.test(name)) result.failures.push({ id: name, reason: 'Retired preload is still staged' })
  if ((await readdir(join(dist, 'renderer'))).includes('browser.html')) result.failures.push({ id: 'browser.html', reason: 'Retired window is still staged' })
  result.passed = result.failures.length === 0
  return { host: deskGap ? 'deskgap' : 'electron', ...result }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkCoreGraph(resolve(dirname(fileURLToPath(import.meta.url)), '..'), process.argv.includes('--deskgap'))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (!result.passed) process.exitCode = 1
  } catch (error) { process.stderr.write(String(error) + '\n'); process.exitCode = 1 }
}
