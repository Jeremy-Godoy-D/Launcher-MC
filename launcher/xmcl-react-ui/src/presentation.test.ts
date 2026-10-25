import { describe, expect, test } from 'vitest'
import { allowAmbientMotion, isPlaybackInterruption, nextFeatured, type MotionState } from './presentation'

const active: MotionState = {
  focused: true,
  visible: true,
  reducedMotion: false,
  performanceMode: false,
  interacting: false,
  dialogOpen: false,
  manuallyPaused: false,
}

describe('prototype ambient policy', () => {
  test('an interrupted playback request remains recoverable without masking permission or decode failures', () => {
    expect(isPlaybackInterruption(new DOMException('Interrupted', 'AbortError'))).toBe(true)
    for (const error of [new DOMException('Denied', 'NotAllowedError'), new Error('Decode failed'), null, undefined]) expect(isPlaybackInterruption(error)).toBe(false)
  })
  test('only active, eligible media advances', () => {
    expect(allowAmbientMotion(active)).toBe(true)
    for (const key of ['focused', 'visible'] as const)
      expect(allowAmbientMotion({ ...active, [key]: false })).toBe(false)
    for (const key of [
      'reducedMotion',
      'performanceMode',
      'interacting',
      'dialogOpen',
      'manuallyPaused',
    ] as const) {
      expect(allowAmbientMotion({ ...active, [key]: true })).toBe(false)
    }
  })
  test('manual navigation wraps correctly, including empty and single-instance lists', () => {
    expect(nextFeatured(0, 0)).toBe(0)
    expect(nextFeatured(0, 1)).toBe(0)
    expect(nextFeatured(2, 3)).toBe(0)
    expect(nextFeatured(0, 3, -1)).toBe(2)
  })
})
