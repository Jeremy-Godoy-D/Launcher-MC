import { expect, test } from 'vitest'
import { InstanceSchema } from '../../../../packages/instance/instance'
import { assignGroup, changeGroup, manualOrder, metadataDraft, metadataEdit, moveInGroups, isOperationCancelled } from './operations'

test.each([new DOMException('Stopped', 'AbortError'), new Error('aborted'), { name: 'CancelledException', exception: { type: 'cancelled' } }, { name: 'minified-name', exception: { type: 'cancelled' } }])('recognizes raw and normalized operation cancellation %j', error => {
  expect(isOperationCancelled(error)).toBe(true)
})
test.each([undefined, null, 'cancelled', { exception: null }, { exception: { type: 'networkException' } }, new Error('The operation was aborted')])('does not mistake other failures for cancellation %j', error => {
  expect(isOperationCancelled(error)).toBe(false)
})

const original = { ...InstanceSchema.parse({ name: 'Original', path: 'C:/instances/original', description: 'Before', author: 'QA', runtime: { minecraft: '1.21.1' }, java: 'keep-java', vmOptions: ['keep-argument'] }), path: 'C:/instances/original', creationDate: 1, lastPlayedDate: 0, lastAccessDate: 1, playtime: 0 }

const groups = ['before', { id: 'friends', name: 'Friends', color: '#123456', instances: ['java', 'unknown-edition'] }, { id: 'other', name: 'Other', color: '', instances: ['another'] }, 'after']
test('group rename preserves order, members, other editions and color without mutating the snapshot', () => {
  expect(changeGroup(groups, 'friends', '  FRIENDS  ')[1]).toEqual({ id: 'friends', name: 'FRIENDS', color: '#123456', instances: ['java', 'unknown-edition'] })
  expect(groups[1]).toMatchObject({ name: 'Friends' })
})
test('dissolving a group keeps every member at its original position and preserves all other groups', () => {
  expect(changeGroup(groups, 'friends')).toEqual(['before', 'java', 'unknown-edition', groups[2], 'after'])
  expect(groups).toHaveLength(4)
})
test.each(['', 'oThEr', 'x'.repeat(101)])('rejects invalid or conflicting group name %j', name => {
  expect(() => changeGroup(groups, 'friends', name)).toThrow('invalidGroup')
})
test('missing groups require a fresh review', () => {
  expect(() => changeGroup(groups, 'missing', 'Rename')).toThrow('changed')
  expect(() => changeGroup(groups, 'missing')).toThrow('changed')
})
test('edits only captured metadata and supplies a main-process comparison without overwriting runtime settings', () => {
  const draft = { name: ' Renamed ', description: 'After', author: 'Author' }
  expect(metadataEdit(original, { ...original, java: 'new-java' }, draft, [original])).toEqual({ instancePath: original.path, name: 'Renamed', description: 'After', author: 'Author', expectedMetadata: metadataDraft(original) })
  expect(original.java).toBe('keep-java')
})
test('blocks missing, changed and duplicate instances instead of using a new selection', () => {
  const draft = { ...metadataDraft(original), name: 'Renamed' }
  expect(() => metadataEdit(original, undefined, draft, [])).toThrow('missing')
  expect(() => metadataEdit(original, { ...original, path: 'other' }, draft, [])).toThrow('missing')
  expect(() => metadataEdit(original, { ...original, description: 'changed elsewhere' }, draft, [original])).toThrow('changed')
  expect(() => metadataEdit(original, original, draft, [original, { ...original, path: 'other', name: 'RENAMED' }])).toThrow('duplicateName')
})
test.each(['', '../outside', 'CON', 'a\nb', 'x'.repeat(101)])('rejects invalid instance name %j', name => {
  expect(() => metadataEdit(original, original, { ...metadataDraft(original), name }, [original])).toThrow('invalid')
})
test('manual ordering follows groups, deduplicates visible paths and appends new instances', () => {
  const b = { ...original, path: 'b' }, c = { ...original, path: 'c' }
  expect(manualOrder([original, b, c], ['b', { instances: [original.path, 'bedrock', original.path] }]).map(instance => instance.path)).toEqual(['b', original.path, 'c'])
})
test('group moves retain unrelated data, unknown edition members and group properties', () => {
  const groups = [{ id: 'old', name: 'Old', color: '#123456', instances: [original.path, 'bedrock'] }, 'other']
  const added = assignGroup(groups, original.path, 'new', 'Friends', 'new-id')
  expect(added).toEqual([{ id: 'old', name: 'Old', color: '#123456', instances: ['bedrock'] }, 'other', { id: 'new-id', name: 'Friends', color: '', instances: [original.path] }])
  expect(groups[0]).toMatchObject({ instances: [original.path, 'bedrock'] })
  const restored = assignGroup(added, original.path, 'id:old', '', '')
  expect(restored[0]).toMatchObject({ instances: ['bedrock', original.path] })
  expect(assignGroup(restored, original.path, '', '', '').at(-1)).toBe(original.path)
  expect(() => assignGroup(groups, original.path, 'id:missing', '', '')).toThrow('changed')
  expect(() => assignGroup(groups, original.path, 'new', 'OLD', 'new-id')).toThrow('invalidGroup')
})
test('manual movement stays within an assigned group and keeps other groups intact', () => {
  const groups = [{ id: 'group', name: 'Group', color: '', instances: [original.path, 'b'] }, 'external']
  expect(moveInGroups(groups, [original], original.path, 1)[0]).toMatchObject({ instances: ['b', original.path] })
  expect(groups[0]).toMatchObject({ instances: [original.path, 'b'] })
  expect(moveInGroups(['b'], [original], original.path, -1)).toEqual([original.path, 'b'])
})
