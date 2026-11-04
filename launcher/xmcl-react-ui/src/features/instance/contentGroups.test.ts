import { expect, it } from 'vitest'
import { assignContentGroup, contentGroupMemberships, editContentGroup } from './contentGroups'

it('renames and dissolves a group without changing its files or unrelated/unknown metadata', () => {
  const groups = { A: { color: 'red', files: ['a.jar'], future: 'keep' }, B: { color: '', files: ['b.jar'] } }, before = structuredClone(groups)
  expect(editContentGroup(groups, 'A', ' C ', '#ffffff')).toEqual({ B: groups.B, C: { ...groups.A, color: '#ffffff' } })
  expect(editContentGroup(groups, 'A', '', '', true)).toEqual({ B: groups.B })
  for (const name of ['B', '__proto__', ' ']) expect(() => editContentGroup(groups, 'A', name, '')).toThrow()
  expect(Object.keys(editContentGroup(groups, 'A', 'C', ''))).toEqual(['C', 'B'])
  expect(groups).toEqual(before)
})
it('moves normalized enabled/disabled filenames to one group and can leave them ungrouped', () => {
  const groups = { A: { color: '', files: ['mods/a.jar', 'b.jar'] }, B: { color: '', files: [] } }
  const next = assignContentGroup(groups, ['a.jar.disabled', 'a.jar'], 'B')
  expect(next).toEqual({ A: { color: '', files: ['b.jar'] }, B: { color: '', files: ['a.jar'] } })
  expect(assignContentGroup(next, ['a.jar'])).toEqual({ A: next.A, B: { color: '', files: [] } })
  expect(() => assignContentGroup(groups, ['a.jar'], 'missing')).toThrow('changed')
})

it('indexes legacy and disabled names once while preserving multiple group memberships', () => {
  const groups = { A: { color: '', files: ['mods/a.jar', 'a.jar.disabled'] }, B: { color: '', files: ['a.jar'] } }
  expect(contentGroupMemberships(groups).get('a.jar')).toEqual(['A', 'B'])
  expect(contentGroupMemberships({}).size).toBe(0)
})
