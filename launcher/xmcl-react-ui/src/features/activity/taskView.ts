import type { Task } from '@xmcl/runtime-api/src/task'

const labels: Record<string, string> = {
  downloaUpdate: 'update', installJava: 'java', installMinecraft: 'minecraft', installAssets: 'assets', installLibraries: 'libraries',
  installFabric: 'loader', installForge: 'loader', installNeoForge: 'loader', installQuilt: 'loader', installOptifine: 'loader', installLabyMod: 'loader',
  installInstance: 'instance', duplicateInstance: 'copy', exportModpack: 'export', downloadModpack: 'modpack',
  resolveMarketFiles: 'requirements', installModrinthFile: 'content', installCurseforgeFile: 'content',
}
export const taskLabel = (task: Pick<Task, 'type'>) => Object.hasOwn(labels, task.type) ? labels[task.type] : 'operation'
export function taskProgress(task: Pick<Task, 'progress'>) {
  const value = task.progress
  if (!value || !Number.isSafeInteger(value.total) || value.total <= 0 || !Number.isFinite(value.progress) || value.progress < 0) return
  return { max: value.total, value: Math.min(value.progress, value.total) }
}
export function taskInstance(task: Task, instances: readonly { path: string; name: string }[]) {
  for (const key of ['instancePath', 'instance', 'path', 'from', 'to']) {
    const value = Reflect.get(task, key)
    const instance = typeof value === 'string' ? instances.find(instance => instance.path === value) : undefined
    if (instance) return instance.name
  }
}
