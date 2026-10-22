<template>
  <div
    class="header sticky max-w-full select-none transition-all z-20 mc-hairline-b bg-[var(--mc-canvas)]/95 backdrop-blur-md"
    :style="{
      '--app-bar-blur': blurAppBar + 'px',
    }"
    :class="{
      compact,
    }"
    @transitionstart="onTransitionStart"
    @transitionend="onTransitionEnd"
    @transitioncancel="onTransitionEnd"
    @wheel.stop
  >
    <div
      class="px-7 pt-4 pb-0 flex flex-col gap-3 header-content"
      style="margin: auto"
      :style="{
        opacity: dragover ? 0 : '',
      }"
    >
      <div
        class="header-primary-row align-center flex flex-wrap items-center gap-3"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <span
            :style="{
              fontSize: headerFontSize
            }"
            class="home-title font-bold tracking-tight text-[var(--mc-ink)] overflow-hidden overflow-ellipsis whitespace-nowrap transition-all"
          >{{ name || `Minecraft ${version.minecraft}` }}</span>
        </div>
        <span
          class="mc-tag mc-tag--jade mc-tabular flex-shrink-0"
          data-testid="instance-header-runtime"
        >
          MC {{ version.minecraft }} · {{ loaderLabel }}
        </span>
        <router-view name="route" />
        <div class="flex-grow" />
        <router-view name="actions" v-slot="{ Component }">
          <transition
            name="slide-x-transition"
            mode="out-in"
          >
            <component :is="Component" class="flex-shrink-0" />
          </transition>
        </router-view>
      </div>

      <nav
        aria-label="Secciones de la instancia"
        class="instance-tab-nav flex items-center flex-wrap gap-1"
      >
        <v-btn
          to="/"
          exact
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="home"
          data-testid="instance-tab-overview"
        >
          Resumen
        </v-btn>
        <v-btn
          to="/mods"
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="extension"
          data-testid="instance-tab-mods"
        >
          Contenido ({{ t('mod.name', 2) }})
        </v-btn>
        <v-btn
          to="/resourcepacks"
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="palette"
          data-testid="instance-tab-resourcepacks"
        >
          {{ t('resourcepack.name', 2) }}
        </v-btn>
        <v-btn
          to="/shaderpacks"
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="gradient"
          data-testid="instance-tab-shaderpacks"
        >
          {{ t('shaderPack.name', 2) }}
        </v-btn>
        <v-btn
          to="/save"
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="map"
          data-testid="instance-tab-saves"
        >
          {{ t('save.name', 2) }}
        </v-btn>
        <v-btn
          to="/base-setting"
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium"
          prepend-icon="tune"
          data-testid="instance-tab-settings"
        >
          Configuración
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          class="mc-header-tab rounded-t-md rounded-b-none text-none font-medium ml-auto"
          prepend-icon="subtitles"
          data-testid="instance-tab-console"
          @click="showLogDialog()"
        >
          Consola
        </v-btn>
      </nav>

      <router-view name="extensions" v-slot="{ Component }">
        <transition
          name="slide-y-reverse-transition"
          mode="out-in"
        >
          <component
            :is="Component"
            class="header-extension pb-2"
          />
        </transition>
      </router-view>
    </div>

    <div
      v-if="dragover"
      class="w-full h-full flex top-0 p-5"
      style="position: absolute;"
      @dragenter="overcount++"
      @dragleave="overcount--"
      @drop="overcount = 0; onDropModpack($event)"
    >
      <Hint
        :text="t('modpack.dropHint')"
        icon="save_alt"
        class="rounded transition-all"
        :class="{
          dragover,
          yellow: overcount > 0,
          'darken-2': overcount > 0,
        }"
        :style="{
          transform: overcount > 0 ? 'scale(1.0125)' : ''
        }"
      />
    </div>
  </div>
</template>

<script lang=ts setup>
import Hint from '@/components/Hint.vue'
import { useDialog } from '@/composables/dialog'
import { kDropHandler } from '@/composables/dropHandler'
import { kInstance } from '@/composables/instance'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kCompact } from '@/composables/scrollTop'
import { kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'

const { name, runtime: version } = injection(kInstance)
const { blurAppBar } = injection(kTheme)
const { t } = useI18n()
const { show: showLogDialog } = useDialog('log')

const loaderLabel = computed(() => {
  if (version.value.fabricLoader) return `Fabric ${version.value.fabricLoader}`
  if (version.value.neoForged) return `NeoForge ${version.value.neoForged}`
  if (version.value.forge) return `Forge ${version.value.forge}`
  return 'Vanilla'
})

const transitioning = ref(false)
provide('transitioning', transitioning)

const onTransitionStart = (e: TransitionEvent) => {
  if (e.propertyName !== 'transform') return
  transitioning.value = true
}
const onTransitionEnd = (e: TransitionEvent) => {
  if (e.propertyName !== 'transform') return
  transitioning.value = false
}

const compact = injection(kCompact)
const headerFontSize = computed(() => {
  if (compact.value) {
    return '1.25rem'
  }
  if (name.value && name.value.length > 30) {
    return '1.55rem'
  }
  return '1.85rem'
})

const { dragover } = injection(kDropHandler)
const { show } = useDialog(AddInstanceDialogKey)
const onDropModpack = (e: DragEvent) => {
  e.preventDefault()
  const file = e.dataTransfer?.files.item(0)
  if (file) {
    const filePath = windowController.getPathForFile(file)
    if (!filePath) return
    show({
      format: 'modpack',
      path: filePath,
    })
  }
}

const overcount = ref(0)
</script>
<style scoped>
.header-primary-row,
.home-title {
  min-width: 0;
}

.mc-header-tab {
  position: relative;
  color: var(--mc-ink-muted) !important;
  padding-bottom: 4px;
  transition:
    color 150ms var(--mc-ease-out),
    background-color 150ms var(--mc-ease-out);
}

.mc-header-tab:hover {
  color: var(--mc-ink) !important;
  background-color: rgba(243, 241, 236, 0.04) !important;
}

.mc-header-tab.v-btn--active {
  color: var(--mc-ink) !important;
  background-color: transparent !important;
}

.mc-header-tab.v-btn--active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background-color: var(--mc-accent);
}
</style>
