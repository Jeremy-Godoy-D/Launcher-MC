<template>
  <nav aria-label="Navegación principal" class="launcher-navigation mc-rail non-moveable">
    <div class="brand-header px-3.5 py-3 flex items-center justify-between mc-hairline-b">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="brand-mark flex items-center justify-center rounded-lg">
          <img src="http://launcher/icons/logoDark" width="28" height="28" alt="">
        </div>
        <div class="flex flex-col min-w-0">
          <strong class="text-sm font-semibold tracking-tight text-[var(--mc-ink)] leading-tight truncate">Grimo Launcher</strong>
          <span class="text-[11px] text-[var(--mc-ink-muted)] leading-tight truncate mc-tabular">Java Edition · v0.1.0-b3</span>
        </div>
      </div>
    </div>

    <div class="px-2.5 py-2.5 flex flex-col gap-0.5">
      <v-btn
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :data-testid="item.testId"
        variant="text"
        class="nav-item-btn justify-start rounded-lg text-none font-medium"
        :prepend-icon="item.icon"
      >
        {{ item.label }}
      </v-btn>
    </div>

    <section
      v-if="hasInstance"
      aria-label="Instancia seleccionada"
      data-testid="nav-active-instance"
      class="instance-summary px-3 py-3 mc-hairline-t mc-hairline-b flex flex-col gap-1.5"
    >
      <div class="flex items-center justify-between gap-2 px-1">
        <div class="font-semibold text-sm text-[var(--mc-ink)] truncate" :title="instanceTitle">
          {{ instanceTitle }}
        </div>
        <span class="mc-tag shrink-0" :class="loaderTagClass">
          {{ loaderShortLabel }}
        </span>
      </div>
      <div class="text-xs text-[var(--mc-ink-muted)] truncate px-1 mb-1 font-mono mc-tabular">
        {{ runtimeSummary }}
      </div>

      <div class="flex flex-col gap-0.5">
        <v-btn
          to="/"
          exact
          data-testid="nav-instance-overview"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-md text-none"
          prepend-icon="play_circle"
        >
          Resumen y jugar
        </v-btn>
        <v-btn
          to="/mods"
          data-testid="nav-instance-content"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-md text-none"
          prepend-icon="extension"
        >
          Contenido
        </v-btn>
        <v-btn
          to="/base-setting"
          data-testid="nav-instance-settings"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-md text-none"
          prepend-icon="tune"
        >
          Configuración
        </v-btn>
        <v-btn
          data-testid="nav-instance-console"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-md text-none"
          prepend-icon="subtitles"
          @click="openConsole"
        >
          Consola
        </v-btn>
      </div>
    </section>

    <div class="mt-auto p-2.5 mc-hairline-t">
      <UserAccountSwitcher />
    </div>
  </nav>
</template>

<script setup lang="ts">
import UserAccountSwitcher from '@/components/UserAccountSwitcher.vue'
import { useDialog } from '@/composables/dialog'
import { kInstance } from '@/composables/instance'
import { injection } from '@/util/inject'

const items = [
  { to: '/me', label: 'Biblioteca', icon: 'apps', testId: 'nav-library' },
  { to: '/store', label: 'Explorar contenido', icon: 'travel_explore', testId: 'nav-store' },
  { to: '/accounts', label: 'Cuentas', icon: 'badge', testId: 'nav-accounts' },
  { to: '/setting', label: 'Ajustes', icon: 'tune', testId: 'nav-settings' },
]

const { path, name, runtime } = injection(kInstance)
const { show: showLogDialog } = useDialog('log')
const router = useRouter()
const route = useRoute()

const hasInstance = computed(() => Boolean(path.value))
const instanceTitle = computed(() => name.value || `Minecraft ${runtime.value.minecraft || ''}`.trim())
const loaderShortLabel = computed(() => {
  if (runtime.value.fabricLoader) return 'Fabric'
  if (runtime.value.neoForged) return 'NeoForge'
  if (runtime.value.forge) return 'Forge'
  return 'Vanilla'
})
const loaderLabel = computed(() => {
  if (runtime.value.fabricLoader) return `Fabric ${runtime.value.fabricLoader}`
  if (runtime.value.neoForged) return `NeoForge ${runtime.value.neoForged}`
  if (runtime.value.forge) return `Forge ${runtime.value.forge}`
  return 'Vanilla'
})
const loaderTagClass = computed(() => {
  if (runtime.value.neoForged || runtime.value.forge) return 'mc-tag--amber'
  return 'mc-tag--jade'
})
const runtimeSummary = computed(() => {
  const mc = runtime.value.minecraft || 'Sin versión'
  return `MC ${mc} · ${loaderLabel.value}`
})

async function openConsole() {
  const instanceRoutes = ['/', '/mods', '/resourcepacks', '/shaderpacks', '/save', '/base-setting']
  if (!instanceRoutes.includes(route.path)) {
    await router.push('/')
  }
  showLogDialog()
}
</script>

<style scoped>
.launcher-navigation {
  display: flex;
  flex-direction: column;
  width: 236px;
  flex-shrink: 0;
  height: 100%;
  overflow-y: auto;
  z-index: 4;
}

.brand-mark {
  width: 30px;
  height: 30px;
  background-color: var(--mc-accent-soft);
  border: 1px solid rgba(224, 109, 83, 0.32);
}

.nav-item-btn {
  position: relative;
  letter-spacing: 0.005em;
  color: var(--mc-ink-secondary) !important;
  transition:
    background-color 150ms var(--mc-ease-out),
    color 150ms var(--mc-ease-out);
}

.nav-item-btn:hover {
  background-color: rgba(243, 241, 236, 0.05) !important;
  color: var(--mc-ink) !important;
}

.nav-item-btn.v-btn--active {
  background-color: var(--mc-surface) !important;
  color: var(--mc-ink) !important;
}

.nav-item-btn.v-btn--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background-color: var(--mc-accent);
  opacity: 1 !important;
}

.subnav-btn {
  position: relative;
  color: var(--mc-ink-muted) !important;
  transition:
    background-color 150ms var(--mc-ease-out),
    color 150ms var(--mc-ease-out);
}

.subnav-btn:hover {
  background-color: rgba(243, 241, 236, 0.04) !important;
  color: var(--mc-ink) !important;
}

.subnav-btn.v-btn--active {
  background-color: rgba(224, 109, 83, 0.12) !important;
  color: #f49d8a !important;
}

@media (max-width: 960px) {
  .launcher-navigation {
    width: 204px;
  }
}
</style>

