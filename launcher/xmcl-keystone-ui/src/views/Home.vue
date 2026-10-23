<template>
  <div ref="scrollElement" class="aurora-instance-overview p-4">
    <HomeCriticalError />
    <HomeBedrock v-if="isBedrock" />
    <template v-else>
      <section class="glass-2 flex items-center gap-4 p-5 mb-4">
        <InstanceIcon :instance="instance" :width="64" :height="64" />
        <div class="min-w-0 flex-grow"><h2 class="text-xl font-semibold">{{ instance.name }}</h2><p class="text-sm text-[var(--mc-ink-muted)]">{{ instance.description || 'Tu espacio de Minecraft: mundos, contenido y ajustes propios.' }}</p></div>
        <v-btn variant="text" to="/me" append-icon="arrow_forward">Biblioteca</v-btn>
      </section>
      <HomeGrid />
      <HomeUpstreamCurseforge v-if="instance.upstream?.type === 'curseforge-modpack'" :id="instance.upstream.modId" />
      <HomeUpstreamModrinth v-else-if="instance.upstream?.type === 'modrinth-modpack'" :id="instance.upstream.projectId" />
      <HomeUpstreamFeedTheBeast v-else-if="instance.upstream?.type === 'ftb-modpack'" :id="instance.upstream.id" />
    </template>
  </div>
</template>
<script lang="ts" setup>
import { kInstance } from '@/composables/instance'
import { useGamepadAction } from '@/composables/gamepad'
import { kUpstream } from '@/composables/instanceUpdate'
import { kCompact } from '@/composables/scrollTop'
import { useTutorial } from '@/composables/tutorial'
import { useInFocusMode } from '@/composables/uiLayout'
import { injection } from '@/util/inject'
import { isBedrockInstance } from '@xmcl/instance'
import type { DriveStep } from 'driver.js'
import HomeCriticalError from './HomeCriticalError.vue'
import InstanceIcon from '@/components/InstanceIcon.vue'
import HomeBedrock from './HomeBedrock.vue'
import HomeGrid from './HomeGrid.vue'
import HomeUpstreamCurseforge from './HomeUpstreamCurseforge.vue'
import HomeUpstreamFeedTheBeast from './HomeUpstreamFeedTheBeast.vue'
import HomeUpstreamModrinth from './HomeUpstreamModrinth.vue'

const isFocus = useInFocusMode()
const { instance } = injection(kInstance)
const isBedrock = computed(() => isBedrockInstance(instance.value))

watch(isBedrock, (bedrock) => {
  if (bedrock) {
    isFocus.value = false
  }
}, { immediate: true })
provide(
  kUpstream,
  computed(() => ({
    upstream: instance.value.upstream,
    minecraft: instance.value.runtime.minecraft,
  })),
)

const compact = injection(kCompact)
onMounted(() => {
  compact.value = false
})

const scrollElement = ref(null as HTMLElement | null)
provide('scrollElement', scrollElement)

const { t } = useI18n()

import { kLaunchButton } from '@/composables/launchButton'

// Gamepad face-button actions scoped to the home page (auto-unregister on leave).
const router = useRouter()
const { text: launchText, onClick: onLaunchClick } = injection(kLaunchButton)
useGamepadAction('X', {
  label: () => launchText.value,
  handler: () => onLaunchClick(),
})
useGamepadAction('Y', {
  label: () => t('gamepad.guide.instanceSettings'),
  handler: () => router.push('/base-setting'),
})

useTutorial(
  computed(() => {
    const steps: DriveStep[] = [
      {
        element: '#my-stuff-button',
        popover: { title: t('userAccount.add'), description: t('tutorial.userAccountDescription') },
      },
      {
        element: '#create-instance-button',
        popover: { title: t('instances.add'), description: t('tutorial.instanceAddDescription') },
      },
      {
        element: '#launch-button',
        popover: { title: t('launch.launch'), description: t('tutorial.launchDescription') },
      },
      {
        element: '#feedback-button',
        popover: { title: t('feedback.name'), description: t('tutorial.feedbackDescription') },
      },
    ]
    return steps
  }),
)
</script>
