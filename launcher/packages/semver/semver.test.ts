import { expect, it } from 'vitest'
import { parseSemanticVersion } from './semver'
import { parseVersionRange } from './range'

it('rejects NaN, partial integer prefixes, empty and unsafe numeric components', () => {
  for (const version of ['garbage', '1.2abc', '1..2', '1.2.9007199254740993', 'Infinity', '-1']) expect(() => parseSemanticVersion(version)).toThrow()
})
it('retains partial, extended, prerelease and wildcard range comparison', () => {
  for (const [range, version, matches] of [
    ['>=1.20 <1.22', '1.21.1', true], ['>=1.20 <1.22', '1.22', false],
    ['1.2.x', '1.2.9', true], ['1.2.x', '1.3.0', false],
    ['~1.2.3', '1.2.9', true], ['~1.2.3', '1.3.0', false],
    ['^1.2.3', '1.9.0', true], ['^1.2.3', '2.0.0', false],
    ['>=1.2.3.4', '1.2.3.5', true], ['>=1.2.3', '1.2.3-beta.1', false],
  ] as const) expect(parseVersionRange(range).test(parseSemanticVersion(version))).toBe(matches)
})
