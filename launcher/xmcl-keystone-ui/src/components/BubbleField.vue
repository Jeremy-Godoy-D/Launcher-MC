<template>
  <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
    <svg width="0" height="0" class="absolute"><defs><filter id="aurora-merge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -4" /></filter></defs></svg>
    <canvas ref="canvas" class="aurora-bubbles" :data-state="paused ? 'paused' : 'running'" />
  </div>
</template>
<script setup lang="ts">
import { useDocumentVisibility, useWindowFocus, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { useAuroraPreferences } from '@/composables/aurora'
import { kInstanceLaunchCoordinator } from '@/composables/instanceLaunchCoordinator'
import { kInstance } from '@/composables/instance'
import { injection } from '@/util/inject'
const canvas = ref<HTMLCanvasElement>()
const { performanceMode, bubbleReactive } = useAuroraPreferences()
const { runningInstances } = injection(kInstanceLaunchCoordinator)
const { instance } = injection(kInstance)
const visibility = useDocumentVisibility()
const focus = useWindowFocus()
const nativeActive = ref(true)
const onActivity = (active: boolean) => { nativeActive.value = active }
windowController.on('window-active', onActivity)
const reduced = usePreferredReducedMotion()
const paused = computed(() => performanceMode.value || reduced.value === 'reduce' || visibility.value !== 'visible' || !focus.value || !nativeActive.value || Object.keys(runningInstances.value).length > 0)
const bubbles = Array.from({ length: 18 }, (_, i) => ({ x: ((i * 37 + 17) % 100) / 100, y: ((i * 61 + 13) % 100) / 100, r: 45 + (i * 17 % 80), phase: i * 1.7 }))
let frame = 0
let previous = 0
let elapsed = 0
let width = 1
let height = 1
let accent = [52, 211, 153]
let colorGeneration = 0
const pointer = { x: -1000, y: -1000 }
function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  for (const b of bubbles) {
    let x = b.x * width + Math.sin(elapsed * 0.09 + b.phase) * 55
    let y = b.y * height + Math.cos(elapsed * 0.07 + b.phase) * 50
    const dx = x - pointer.x
    const dy = y - pointer.y
    const distance = Math.hypot(dx, dy)
    if (distance < 170 && distance > 0) { x += dx / distance * (170 - distance) * 0.12; y += dy / distance * (170 - distance) * 0.12 }
    const radius = b.r
    const gradient = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.3, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(' + accent.join(',') + ',.65)')
    gradient.addColorStop(0.7, 'rgba(' + accent.join(',') + ',.32)')
    gradient.addColorStop(1, 'rgba(' + accent.join(',') + ',0)')
    ctx.fillStyle = gradient
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  }
}
function tick(now: number) {
  if (paused.value) { frame = 0; return }
  if (now - previous >= 1000 / 30) { elapsed += Math.min((now - previous) / 1000, 0.05); previous = now; draw() }
  frame = requestAnimationFrame(tick)
}
function sync() { cancelAnimationFrame(frame); frame = 0; previous = performance.now(); draw(); if (!paused.value) frame = requestAnimationFrame(tick) }
function resize() {
  if (!canvas.value) return
  const bounds = canvas.value.getBoundingClientRect()
  width = bounds.width; height = bounds.height
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.value.width = Math.round(width * dpr); canvas.value.height = Math.round(height * dpr)
  canvas.value.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}
function move(e: PointerEvent) { pointer.x = e.clientX; pointer.y = e.clientY }
watch([() => instance.value.icon, bubbleReactive], ([icon, reactive]) => {
  const generation = ++colorGeneration
  accent = [52, 211, 153]
  // Read local launcher media only; remote images must never taint the canvas.
  if (!reactive || !icon || !/^(image:|data:image\/|https?:\/\/(launcher|localhost)([:/]|$))/.test(icon)) { draw(); return }
  const image = new Image()
  image.onload = () => {
    if (generation !== colorGeneration) return
    try {
      const sample = document.createElement('canvas'); sample.width = sample.height = 1
      const context = sample.getContext('2d')!
      context.drawImage(image, 0, 0, 1, 1)
      const pixel = context.getImageData(0, 0, 1, 1).data
      if (pixel[3] && Math.max(pixel[0], pixel[1], pixel[2]) > 45) accent = [pixel[0], pixel[1], pixel[2]]
    } catch { /* Local media may still be blocked by Chromium's image policy. */ }
    draw()
  }
  image.src = icon
}, { immediate: true })
watch(paused, sync)
useResizeObserver(canvas, resize)
onMounted(() => { resize(); sync(); window.addEventListener('pointermove', move, { passive: true }) })
onUnmounted(() => { colorGeneration++; cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); windowController.removeListener('window-active', onActivity) })
</script>
