<template>
  <nav aria-label="Navegación principal" class="launcher-navigation lg-surface non-moveable">
    <div class="brand-header px-3 py-2.5 flex items-center justify-between">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="brand-glyph flex items-center justify-center rounded-xl">
          <v-icon size="18" color="#34d399">view_in_ar</v-icon>
        </div>
        <div class="flex flex-col min-w-0">
          <strong class="text-sm font-bold tracking-tight text-slate-100 leading-tight truncate">Launcher MC</strong>
          <span class="text-[11px] text-emerald-300/80 font-medium tracking-wide">Edición Java · x64</span>
        </div>
      </div>
      <span class="lg-pill lg-pill--emerald text-[10px]! px-2! py-0.5!">v0.1.0-b2</span>
    </div>

    <div class="px-2 pt-1 pb-0.5">
      <div class="lg-eyebrow px-2 mb-1.5">Navegación</div>
      <div class="flex flex-col gap-1">
        <v-btn
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          :data-testid="item.testId"
          variant="text"
          class="nav-item-btn justify-start rounded-xl text-none font-medium"
          :prepend-icon="item.icon"
        >
          {{ item.label }}
        </v-btn>
      </div>
    </div>

    <section
      v-if="hasInstance"
      aria-label="Instancia seleccionada"
      data-testid="nav-active-instance"
      class="instance-summary lg-inset mx-1.5 mt-2 p-3 flex flex-col gap-1.5"
    >
      <div class="flex items-center justify-between gap-2 px-1">
        <span class="lg-eyebrow flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Instancia activa
        </span>
        <span class="lg-pill text-[10px]! px-2! py-0.5!" :class="loaderPillClass">
          {{ loaderLabel }}
        </span>
      </div>

      <div class="font-bold text-sm text-slate-100 truncate px-1 mt-0.5" :title="instanceTitle">
        {{ instanceTitle }}
      </div>
      <div class="text-xs text-slate-300/75 truncate px-1 mb-1 font-mono">
        {{ runtimeSummary }}
      </div>

      <div class="flex flex-col gap-0.5">
        <v-btn
          to="/"
          exact
          data-testid="nav-instance-overview"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-lg text-none"
          prepend-icon="play_circle"
        >
          Resumen y jugar
        </v-btn>
        <v-btn
          to="/mods"
          data-testid="nav-instance-content"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-lg text-none"
          prepend-icon="extension"
        >
          Contenido
        </v-btn>
        <v-btn
          to="/base-setting"
          data-testid="nav-instance-settings"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-lg text-none"
          prepend-icon="tune"
        >
          Configuración
        </v-btn>
        <v-btn
          data-testid="nav-instance-console"
          size="small"
          variant="text"
          class="subnav-btn justify-start rounded-lg text-none"
          prepend-icon="subtitles"
          @click="openConsole"
        >
          Consola
        </v-btn>
      </div>
    </section>

    <div class="mt-auto pt-2 px-1">
      <div class="lg-eyebrow px-2 mb-1">Sesión activa</div>
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
const loaderLabel = computed(() => {
  if (runtime.value.fabricLoader) return `Fabric ${runtime.value.fabricLoader}`
  if (runtime.value.neoForged) return `NeoForge ${runtime.value.neoForged}`
  if (runtime.value.forge) return `Forge ${runtime.value.forge}`
  return 'Vanilla'
})
const loaderPillClass = computed(() => {
  if (runtime.value.fabricLoader) return 'lg-pill--cyan'
  if (runtime.value.neoForged || runtime.value.forge) return 'lg-pill--amber'
  return 'lg-pill--emerald'
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
  gap: 8px;
  width: 248px;
  flex-shrink: 0;
  margin: 6px 0 10px 10px;
  padding: 12px 10px;
  border-radius: 22px;
  overflow-y: auto;
  z-index: 4;
}

.brand-glyph {
  width: 34px;
  height: 34px;
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.24) 0%, rgba(6, 182, 212, 0.14) 100%);
  border: 1px solid rgba(52, 211, 153, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 6px 16px -4px rgba(16, 185, 129, 0.3);
}

.nav-item-btn {
  letter-spacing: 0.01em;
  color: rgba(226, 232, 240, 0.82) !important;
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-item-btn:hover {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ffffff !important;
}

.nav-item-btn.v-btn--active {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.22) 0%, rgba(6, 182, 212, 0.08) 100%) !important;
  border: 1px solid rgba(52, 211, 153, 0.35);
  color: #6ee7b7 !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 8px 20px -8px rgba(16, 185, 129, 0.35);
}

.subnav-btn {
  color: rgba(226, 232, 240, 0.78) !important;
}

.subnav-btn.v-btn--active {
  background: rgba(16, 185, 129, 0.16) !important;
  color: #6ee7b7 !important;
}

@media (max-width: 960px) {
  .launcher-navigation {
    width: 204px;
    margin: 4px 0 8px 6px;
  }
}
</style>
