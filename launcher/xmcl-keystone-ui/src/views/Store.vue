<template>
  <div data-testid="store-page" class="store visible-scroll relative flex flex-col overflow-hidden h-full">
    <StoreEntry />
    <v-dialog :model-value="projectOpen" width="1080" scrollable @update:model-value="closeProject">
      <div class="glass-3 aurora-project-sheet">
        <div class="flex justify-end sticky top-0 z-20 px-3 py-2"><v-btn icon="close" variant="tonal" aria-label="Volver al catálogo" @click="closeProject(false)" /></div>
        <router-view v-slot="{ Component }"><component :is="Component" v-if="projectOpen" /></router-view>
      </div>
    </v-dialog>
  </div>
</template>
<script setup lang="ts">
import StoreEntry from './StoreEntry.vue'
const route = useRoute()
const router = useRouter()
const projectOpen = computed(() => route.path !== '/store' && route.path !== '/store/')
function closeProject(open: boolean) { if (!open) router.push({ path: '/store', query: route.query }) }
</script>
<style>
.aurora-project-sheet { max-height: 88vh; overflow: auto; }
.aurora-filter-dialog { align-self: flex-start; margin: 60px 20px !important; max-height: calc(100vh - 100px) !important; }
</style>
