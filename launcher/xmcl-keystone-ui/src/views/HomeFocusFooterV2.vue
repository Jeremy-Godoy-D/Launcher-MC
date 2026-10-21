<template>
  <div class="w-full pb-2">
    <div class="relative footer lg-surface rounded-3xl p-4 flex-grow flex items-center justify-between gap-4 flex-wrap">
      <HomeFooterCard />
      <div
        key="launch-button-group"
        class="flex flex-wrap justify-end items-center gap-y-4 gap-x-2 flex-grow"
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