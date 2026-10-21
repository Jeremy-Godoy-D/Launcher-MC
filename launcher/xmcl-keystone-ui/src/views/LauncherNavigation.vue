<template>
  <nav aria-label="Navegación principal" class="launcher-navigation non-moveable">
    <div class="px-3 py-3 flex items-center justify-between">
      <strong class="text-base tracking-tight">Launcher MC</strong>
      <span class="text-xs opacity-60">Beta</span>
    </div>

    <div class="flex flex-col gap-1">
      <v-btn
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :data-testid="item.testId"
        variant="text"
        class="justify-start"
        :prepend-icon="item.icon"
      >
        {{ item.label }}
      </v-btn>
    </div>

    <v-divider v-if="hasInstance" class="my-2 opacity-20" />

    <section
      v-if="hasInstance"
      aria-label="Instancia seleccionada"
      data-testid="nav-active-instance"
      class="instance-summary rounded-xl p-2.5 flex flex-col gap-1"
    >
      <div class="text-xs uppercase tracking-wider opacity-60 px-1">
        Instancia activa
      </div>
      <div class="font-semibold text-sm truncate px-1" :title="instanceTitle">
        {{ instanceTitle }}
      </div>
      <div class="text-xs opacity-75 truncate px-1 mb-1">
        {{ runtimeSummary }}
      </div>
      <v-btn
        to="/"
        exact
        data-testid="nav-instance-overview"
         size="small"
        variant="text"
        class="justify-start"
        prepend-icon="play_circle"
      >
        Resumen y jugar
      </v-btn>
      <v-btn
        to="/mods"
        data-testid="nav-instance-content"
        size="small"
        variant="text"
        class="justify-start"
        prepend-icon="extension"
      >
        Contenido
      </v-btn>
      <v-btn
        to="/base-setting"
        data-testid="nav-instance-settings"
        size="small"
        variant="text"
        class="justify-start"
        prepend-icon="tune"
      >
        Configuración
      </v-btn>
      <v-btn
        data-testid="nav-instance-console"
        size="small"
        variant="text"
        class="justify-start"
        prepend-icon="subtitles"
        @click="openConsole"
      >
        Consola
      </v-btn>
    </section>

    <div class="mt-auto pt-2">
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
  { to: '/store', label: 'Explorar contenido', icon: 'search', testId: 'nav-store' },
  { to: '/accounts', label: 'Cuentas', icon: 'person', testId: 'nav-accounts' },
  { to: '/setting', label: 'Ajustes', icon: 'settings', testId: 'nav-settings' },
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
const runtimeSummary = computed(() => {
  const mc = runtime.value.minecraft || 'Sin versión'
  return `${mc} · ${loaderLabel.value}`
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
  gap: 6px;
  width: 224px;
  flex-shrink: 0;
  padding: 8px;
  background: #141821;
  overflow-y: auto;
}
.instance-summary {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
@media (max-width: 900px) {
  .launcher-navigation {
    width: 180px;
  }
}
</style>
