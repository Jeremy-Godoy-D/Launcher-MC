import { useLocalStorage } from '@vueuse/core'

/** Hardware preferences stay on this device when a theme is exported. */
export function useAuroraPreferences() {
  return {
    performanceMode: useLocalStorage('aurora.performanceMode', false),
    bubbleReactive: useLocalStorage('aurora.bubbleReactive', true),
  }
}
