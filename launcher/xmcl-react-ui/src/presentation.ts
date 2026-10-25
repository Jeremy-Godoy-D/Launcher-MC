export const ROTATION_MS = 30_000

export function isPlaybackInterruption(error: unknown) {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
}

export type MotionState = {
  focused: boolean
  visible: boolean
  reducedMotion: boolean
  performanceMode: boolean
  interacting: boolean
  dialogOpen: boolean
  manuallyPaused: boolean
}

export function allowAmbientMotion(state: MotionState) {
  return (
    state.focused &&
    state.visible &&
    !state.reducedMotion &&
    !state.performanceMode &&
    !state.interacting &&
    !state.dialogOpen &&
    !state.manuallyPaused
  )
}

export function nextFeatured(current: number, length: number, direction = 1) {
  return length === 0 ? 0 : (((current + direction) % length) + length) % length
}
