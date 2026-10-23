<template>
  <div
    data-testid="settings-page"
    class="d-flex fill-height setting-page"
  >
    <!-- Navigation Sidebar (Only in Wide/Scroll Mode) -->
    <nav v-if="!isNarrowView" id="settings-nav" class="setting-sidebar pt-6 pl-4 pr-2" :aria-label="t('setting.name', 2)">
      <div class="p-1.5"><v-text-field v-model="settingsSearch" label="Buscar ajustes" prepend-inner-icon="search" density="compact" variant="outlined" hide-details class="mb-3" />
        <v-list nav role="listbox" :aria-label="t('setting.name', 2)" density="compact" bg-color="transparent" :selected="[activeSectionIndex]" @update:selected="v => activeSectionIndex = (v[0] as number) ?? 0">
          <v-list-item
            v-for="(item, idx) in sections" v-show="matchesSection(item)"
            :key="item.id"
            :value="idx"
            class="mb-0.5 rounded-md"
            color="primary"
            :title="t(item.title)"
            @click="scrollTo(item.id)"
          >
            <template #prepend>
              <v-icon size="small">{{ item.icon }}</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </nav>

    <!-- Content Area -->
    <div class="setting-content">
      <div v-if="isNarrowView" class="setting-category-header"><v-text-field v-model="settingsSearch" label="Buscar ajustes" prepend-inner-icon="search" density="compact" variant="outlined" hide-details class="mx-4 mb-2" />
        <v-select v-model="activeSectionIndex" :items="sections.map((item, value) => ({ title: t(item.title), value })).filter(item => matchesSection(sections[item.value]))" label="Categoría de ajustes" density="compact" variant="outlined" hide-details class="mx-4" @update:model-value="onTabChange" />
      </div>
      <div ref="scrollContainer" class="overflow-y-auto scroll-container visible-scroll" @scroll="onScroll">
      <div class="content-wrapper mx-auto pa-4 pa-md-6" :class="{ 'tabs-mode': isNarrowView }">
        <p v-if="!sections.some(matchesSection)" class="py-8 text-center text-[var(--mc-ink-muted)]">No se encontraron ajustes con esa búsqueda.</p>
        <!-- All sections rendered vertically in both modes -->
        <section v-show="matchesSection(sections[0])" id="general" class="mb-8 scroll-target" role="region" :aria-label="t('setting.general')">
          <SettingHeader
            :title="t('setting.general')"
            icon="settings"
          />
          <SettingGeneral class="mb-4" />
          <SettingAdvanced />
        </section>
        <section v-show="matchesSection(sections[1])" id="appearance" class="mb-8 scroll-target" role="region" :aria-label="t('setting.appearance')">
          <SettingHeader
            icon="brush"
            :title="t('setting.appearance')"
            :subtitle="t('setting.appearanceDescription')"
          />
          <h3 class="text-lg mb-4">Fondo y rendimiento</h3><SettingGlobalUI />
        </section>
        <section v-show="matchesSection(sections[2])" id="global" class="mb-8 scroll-target" role="region" :aria-label="t('setting.globalSetting')">
          <SettingHeader
            icon="videogame_asset"
            :title="t('setting.globalSetting')"
            :subtitle="t('setting.globalSettingHint')"
          />
          <SettingGlobal />
        </section>
        <section v-show="matchesSection(sections[3])" id="network" class="mb-8 scroll-target" role="region" :aria-label="t('setting.network')">
          <SettingHeader
            :title="t('setting.network')"
            icon="public"
          />
          <SettingNetwork />
        </section>
        <section v-show="matchesSection(sections[4])" id="about" class="mb-12 scroll-target" role="region" :aria-label="t('setting.about')">
          <SettingHeader
            :title="t('setting.about')"
            icon="info"
          />
          <SettingUpdate class="mb-4" />
          <SettingAbout />
        </section>
      </div>

      <SettingUpdateInfoDialog />
      <SettingMigrationDialog />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, nextTick, onMounted, onUnmounted, provide, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingUpdateInfoDialog from './SettingUpdateInfoDialog.vue'
import SettingUpdate from './SettingUpdate.vue'
import SettingGeneral from './SettingGeneral.vue'
import SettingMigrationDialog from './SettingMigrationDialog.vue'
import SettingGlobal from './SettingGlobal.vue'
import SettingAbout from './SettingAbout.vue'
import SettingNetwork from './SettingNetwork.vue'
import { usePresence } from '@/composables/presence'
import { useTutorial } from '@/composables/tutorial'
import { kUpdateSettings, useUpdateSettings } from '@/composables/setting'
import { kSurfaceTokens } from '@/composables/surfaceTokens'
import { injection } from '@/util/inject'
import { kTheme } from '@/composables/theme'
import SettingGlobalUI from './SettingGlobalUI.vue'
import { useMediaQuery } from '@vueuse/core'
import SettingAdvanced from './SettingAdvanced.vue'
import SettingHeader from '@/components/SettingHeader.vue'

const { t } = useI18n()
const route = useRoute()
usePresence(computed(() => t('presence.setting')))

provide(kUpdateSettings, useUpdateSettings())

const { suppressed } = injection(kTheme)
const tokens = injection(kSurfaceTokens)

onMounted(() => {
  suppressed.value = true
  revealRouteTarget()
})
onUnmounted(() => {
  suppressed.value = false
})

const NARROW_BREAKPOINT = 960 // Switch to tabs view when window is narrower than this
const isNarrowView = useMediaQuery(`(max-width: ${NARROW_BREAKPOINT - 1}px)`)

// Navigation Logic
const activeSectionIndex = ref(0)
const scrollContainer = ref<HTMLElement | null>(null)
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const settingsSearch = ref('')
function matchesSection(section: { id: string; title: string }) {
  const query = settingsSearch.value.trim().toLocaleLowerCase()
  if (!query) return true
  const terms: Record<string, string> = { general: 'idioma carpeta java inicio avanzado', appearance: 'fondo rendimiento cristal burbujas tema color interfaz', global: 'memoria ram minecraft java jvm', network: 'red proxy descarga internet', about: 'actualizar actualizaciones versión acerca' }
  return (t(section.title) + ' ' + terms[section.id]).toLocaleLowerCase().includes(query)
}
const sections = [
  { id: 'general', title: 'setting.general', icon: 'tune' },
  { id: 'appearance', title: 'setting.appearance', icon: 'palette' },
  { id: 'global', title: 'setting.globalSetting', icon: 'videogame_asset' },
  { id: 'network', title: 'setting.network', icon: 'wifi' },
  { id: 'about', title: 'setting.about', icon: 'info' },
]

async function revealRouteTarget() {
  if (route.query.target !== 'agent') return
  await nextTick()
  const target = document.getElementById('agent-settings')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target?.querySelector<HTMLElement>('input')?.focus()
}

watch(() => route.query.target, revealRouteTarget)

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el && scrollContainer.value) {
    isUserScrolling.value = true
    const offsetTop = el.offsetTop - 20
    scrollContainer.value.scrollTo({ top: offsetTop, behavior: 'smooth' })
    
    // Reset user scrolling flag after animation completes
    if (scrollTimeout) clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => {
      isUserScrolling.value = false
    }, 500)
  }
}

function onTabChange(index: number) {
  const section = sections[index]
  if (section) {
    scrollTo(section.id)
  }
}

function onScroll() {
  if (!scrollContainer.value || isUserScrolling.value) return
  
  const container = scrollContainer.value
  const scrollTop = container.scrollTop + 100
  
  for (let i = sections.length - 1; i >= 0; i--) {
    const el = document.getElementById(sections[i].id)
    if (el && el.offsetTop <= scrollTop) {
      activeSectionIndex.value = i
      break
    }
  }
}

useTutorial(
  computed(() => [
    {
      element: '#settings-nav',
      popover: {
        title: t('setting.name', 2),
        description: t('tutorial.settings.navDescription'),
      },
    },
    {
      element: '#general',
      popover: {
        title: t('setting.general'),
        description: t('tutorial.settings.generalDescription'),
      },
    },
    {
      element: '#appearance',
      popover: {
        title: t('setting.appearance'),
        description: t('tutorial.settings.appearanceDescription'),
      },
    },
    {
      element: '#global',
      popover: {
        title: t('setting.globalSetting'),
        description: t('tutorial.settings.globalDescription'),
      },
    },
    {
      element: '#network',
      popover: {
        title: t('setting.network'),
        description: t('tutorial.settings.networkDescription'),
      },
    },
  ]),
)
</script>

<style scoped>
.setting-page {
  background: transparent;
  user-select: none;
}

.setting-sidebar {
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: fit-content;
  max-height: 100vh;
}

.setting-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.scroll-container {
  flex: 1;
  min-height: 0;
  scroll-behavior: smooth;
  position: relative;
}

.setting-category-header {
  flex-shrink: 0;
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(8px);
  padding: 8px 0;
  margin-bottom: 16px;
}

.content-wrapper {
  max-width: 80rem;
}

.scroll-target {
  scroll-margin-top: 20px;
}
</style>
