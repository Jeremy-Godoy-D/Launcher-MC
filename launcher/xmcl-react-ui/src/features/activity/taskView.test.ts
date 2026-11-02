import { expect, it } from 'vitest'
import type { Task } from '@xmcl/runtime-api/src/task'
import { taskInstance, taskLabel, taskProgress } from './taskView'

it('renders bounded progress and never treats invalid totals as completion', () => {
  expect(taskProgress({ progress: { progress: 150, total: 100 } })).toEqual({ max: 100, value: 100 })
  for (const progress of [{ progress: 1, total: 0 }, { progress: NaN, total: 100 }, { progress: -1, total: 100 }, { progress: 1, total: Infinity }]) expect(taskProgress({ progress })).toBeUndefined()
})
it('uses human labels and names only from known instances, without exposing URLs or private task keys', () => {
  const task = { type: 'installInstance', instancePath: 'C:/owned', key: 'https://private.invalid/?secret=value' } as unknown as Task
  expect(taskInstance(task, [{ path: 'C:/owned', name: 'My world' }])).toBe('My world')
  expect(taskInstance(task, [])).toBeUndefined(); expect(taskLabel(task)).toBe('instance')
  expect(taskLabel({ type: 'unknown-secret-value' })).toBe('operation')
})
