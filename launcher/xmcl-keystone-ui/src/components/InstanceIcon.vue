<template>
  <div class="aurora-instance-icon" :style="{ width: width + 'px', height: height + 'px' }">
    <img v-if="instance.icon && !failed" :key="instance.icon" :src="instance.icon" alt="" @error="failed = true">
    <v-icon v-else :size="Math.round(width * 0.55)">view_in_ar</v-icon>
  </div>
</template>
<script setup lang="ts">
import type { Instance } from '@xmcl/instance'
const props = withDefaults(defineProps<{ instance: Instance; width?: number; height?: number }>(), { width: 48, height: 48 })
const failed = ref(false)
watch(() => props.instance.icon, () => { failed.value = false })
</script>
