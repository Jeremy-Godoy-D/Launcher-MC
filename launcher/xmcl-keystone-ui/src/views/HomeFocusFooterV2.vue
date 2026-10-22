<template>
  <div class="w-full pb-4">
    <div class="relative footer px-3 py-2 flex-grow flex items-end justify-between gap-6 flex-wrap">
      <HomeFooterCard />
      <div
        key="launch-button-group"
        class="flex flex-wrap justify-end items-center gap-y-4 gap-x-2 flex-grow pb-1"
      >
        <HomeLaunchButtonStatus
          class="mr-4 ml-2"
          :active="active"
        />
        <HomeLaunchButton
          top
          @mouseenter="active = true"
          @mouseleave="active = false"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import HomeLaunchButton from './HomeLaunchButton.vue'
import HomeLaunchButtonStatus from './HomeLaunchButtonStatus.vue'
import HomeFooterCard from './HomeFooterCard.vue'

const active = ref(false)
</script>

<style>
.tabs>div[role="tablist"] {
  background: var(--color-sidebar-bg) !important;
  backdrop-filter: blur(var(--blur-card));
}
</style>
<style scoped>
.footer {
  @apply mx-4;
}

@media (max-width: 850px) {
  .footer {
    @apply mx-2;
  }
}
</style>