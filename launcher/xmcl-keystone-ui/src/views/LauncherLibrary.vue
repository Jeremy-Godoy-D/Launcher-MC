<template>
  <section class="library-view p-6 overflow-auto flex flex-col gap-5">
    <header class="lg-surface rounded-3xl p-6 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="max-w-2xl">
          <div class="lg-eyebrow mb-1.5 flex items-center gap-2">
            <v-icon size="14" color="#34d399">layers</v-icon>
            <span>Entornos aislados · Minecraft Java</span>
          </div>
          <h1 class="lg-hero-title">Biblioteca</h1>
          <p class="text-sm text-slate-300/80 mt-1.5 leading-relaxed">
            Cada instancia mantiene sus propios mods, configuración, recursos y mundos de forma independiente.
          </p>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <div class="hidden sm:flex items-center gap-2">
            <span class="lg-pill">
              <v-icon size="14" color="#34d399">inventory_2</v-icon>
              <span>{{ instances.length }} {{ instances.length === 1 ? 'instancia' : 'instancias' }}</span>
            </span>
          </div>
          <v-btn
            color="primary"
            prepend-icon="add"
            class="rounded-xl font-semibold text-none px-5 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.55)]"
            data-testid="library-create-instance"
            @click="show()"
          >
            Crear instancia
          </v-btn>
        </div>
      </div>

      <div v-if="instances.length > 0" class="flex items-center justify-between gap-3 pt-2 border-t border-white/8 flex-wrap">
        <div class="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por modloader">
          <button
            v-for="opt in loaderFilters"
            :key="opt.id"
            type="button"
            class="filter-pill"
            :class="{ 'filter-pill--active': activeLoaderFilter === opt.id }"
            @click="activeLoaderFilter = opt.id"
          >
            <span>{{ opt.label }}</span>
            <span class="opacity-60 text-[11px] ml-1">{{ opt.count }}</span>
          </button>
        </div>

        <div class="w-full sm:w-64">
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="search"
            placeholder="Filtrar por nombre o versión..."
            aria-label="Filtrar instancias"
          />
        </div>
      </div>
    </header>

    <v-alert v-if="error" type="error" class="rounded-2xl">
      No se pudo cargar la biblioteca. {{ String(error) }}
    </v-alert>
    <v-progress-linear v-if="isValidating" indeterminate color="primary" aria-label="Cargando biblioteca" class="rounded-full" />

    <div
      v-if="!instances.length && !isValidating"
      class="lg-inset p-8 text-center flex flex-col items-center justify-center gap-3 my-2"
    >
      <div class="h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mb-1">
        <v-icon size="28" color="#34d399">rocket_launch</v-icon>
      </div>
      <h2 class="text-lg font-bold text-slate-100">Tu biblioteca está lista para despegar</h2>
      <p class="text-sm text-slate-300/80 max-w-md">
        Crea tu primera instancia de Minecraft Java. Cada instancia conserva sus propios mundos, mods y ajustes.
      </p>
      <v-btn
        color="primary"
        prepend-icon="add"
        class="mt-2 rounded-xl text-none font-semibold"
        @click="show()"
      >
        Crear primera instancia
      </v-btn>
    </div>

    <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(310px, 1fr))">
      <v-card
        v-for="instance in filteredInstances"
        :key="instance.path"
        variant="outlined"
        class="instance-bento-card lg-inset lg-inset-interactive flex flex-col justify-between overflow-hidden"
        :class="{ 'instance-bento-card--active': instance.path === path }"
        :data-testid="`instance-card-${instance.name}`"
      >
        <div>
          <v-card-title class="flex items-start justify-between gap-2 pt-4 px-4 pb-1">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="instance-glyph flex-shrink-0 flex items-center justify-center rounded-xl" :class="getLoaderGlyphClass(instance)">
                <v-icon size="18">{{ getLoaderIcon(instance) }}</v-icon>
              </div>
              <div class="min-w-0">
                <div class="font-bold text-base text-slate-100 truncate" :title="instance.name || `Minecraft ${instance.runtime.minecraft}`">
                  {{ instance.name || `Minecraft ${instance.runtime.minecraft}` }}
                </div>
                <div class="text-xs text-slate-300/75 font-mono">
                  {{ instance.runtime.minecraft }} · {{ getLoaderName(instance) }}
                </div>
              </div>
            </div>
            <v-chip
              v-if="instance.path === path"
              size="x-small"
              color="primary"
              variant="flat"
              class="font-semibold"
            >
              Seleccionada
            </v-chip>
          </v-card-title>

          <v-card-subtitle class="px-4 pt-2 pb-3 flex items-center gap-1.5 flex-wrap opacity-100!">
            <span class="lg-pill text-[11px]!">
              <v-icon size="12" color="#34d399">terminal</v-icon>
              MC {{ instance.runtime.minecraft }}
            </span>
            <span class="lg-pill text-[11px]!" :class="getLoaderPillClass(instance)">
              {{ getLoaderName(instance) }}
            </span>
          </v-card-subtitle>
        </div>

        <v-card-actions class="px-4 py-3 border-t border-white/8 bg-black/20 flex-wrap gap-1.5">
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="play_arrow"
            class="rounded-lg font-semibold text-none"
            @click="open(instance.path, '/')"
          >
            Abrir instancia
          </v-btn>
          <v-btn variant="text" size="small" class="rounded-lg text-none" @click="open(instance.path, '/mods')">
            Contenido
          </v-btn>
          <v-btn variant="text" size="small" class="rounded-lg text-none" @click="open(instance.path, '/base-setting')">
            Configuración
          </v-btn>
          <v-btn variant="text" size="small" class="rounded-lg text-none" @click="openConsole(instance.path)">
            Consola
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            class="rounded-lg text-none"
            :loading="duplicatingPath === instance.path"
            @click="onDuplicate(instance)"
          >
            Duplicar
          </v-btn>
          <v-btn
            variant="text"
            color="error"
            size="small"
            class="rounded-lg text-none ml-auto"
            @click="onDelete(instance)"
          >
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useService } from '@/composables'
import { useDialog } from '@/composables/dialog'
import { kInstance } from '@/composables/instance'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstances } from '@/composables/instances'
import { injection } from '@/util/inject'
import type { Instance } from '@xmcl/instance'
import { InstanceServiceKey } from '@xmcl/runtime-api'

const { instances, isValidating, error } = injection(kInstances)
const { path } = injection(kInstance)
const { duplicateInstance } = useService(InstanceServiceKey)
const { show } = useDialog(AddInstanceDialogKey)
const { show: showDeleteDialog } = useDialog('delete-instance')
const { show: showLogDialog } = useDialog('log')
const router = useRouter()

const duplicatingPath = ref('')
const searchQuery = ref('')
const activeLoaderFilter = ref<'all' | 'vanilla' | 'fabric' | 'forge' | 'neoforge'>('all')

function getLoaderType(instance: Instance): 'vanilla' | 'fabric' | 'forge' | 'neoforge' {
  if (instance.runtime.fabricLoader) return 'fabric'
  if (instance.runtime.neoForged) return 'neoforge'
  if (instance.runtime.forge) return 'forge'
  return 'vanilla'
}

const loaderFilters = computed(() => {
  const list = instances.value
  return [
    { id: 'all' as const, label: 'Todas', count: list.length },
    { id: 'vanilla' as const, label: 'Vanilla', count: list.filter(i => getLoaderType(i) === 'vanilla').length },
    { id: 'fabric' as const, label: 'Fabric', count: list.filter(i => getLoaderType(i) === 'fabric').length },
    { id: 'forge' as const, label: 'Forge', count: list.filter(i => getLoaderType(i) === 'forge').length },
    { id: 'neoforge' as const, label: 'NeoForge', count: list.filter(i => getLoaderType(i) === 'neoforge').length },
  ]
})

const filteredInstances = computed(() => {
  const q = (searchQuery.value || '').trim().toLowerCase()
  return instances.value.filter((inst) => {
    if (activeLoaderFilter.value !== 'all' && getLoaderType(inst) !== activeLoaderFilter.value) {
      return false
    }
    if (!q) return true
    const nameMatch = (inst.name || '').toLowerCase().includes(q)
    const mcMatch = (inst.runtime.minecraft || '').toLowerCase().includes(q)
    const loaderMatch = getLoaderName(inst).toLowerCase().includes(q)
    return nameMatch || mcMatch || loaderMatch
  })
})

function getLoaderName(instance: Instance) {
  if (instance.runtime.fabricLoader) return `Fabric ${instance.runtime.fabricLoader}`
  if (instance.runtime.neoForged) return `NeoForge ${instance.runtime.neoForged}`
  if (instance.runtime.forge) return `Forge ${instance.runtime.forge}`
  return 'Vanilla'
}

function getLoaderIcon(instance: Instance) {
  if (instance.runtime.fabricLoader) return 'auto_awesome'
  if (instance.runtime.neoForged || instance.runtime.forge) return 'hardware'
  return 'view_in_ar'
}

function getLoaderPillClass(instance: Instance) {
  if (instance.runtime.fabricLoader) return 'lg-pill--cyan'
  if (instance.runtime.neoForged || instance.runtime.forge) return 'lg-pill--amber'
  return 'lg-pill--emerald'
}

function getLoaderGlyphClass(instance: Instance) {
  if (instance.runtime.fabricLoader) return 'instance-glyph--cyan'
  if (instance.runtime.neoForged || instance.runtime.forge) return 'instance-glyph--amber'
  return 'instance-glyph--emerald'
}

function open(instancePath: string, targetRoute = '/') {
  path.value = instancePath
  router.push(targetRoute)
}

async function openConsole(instancePath: string) {
  path.value = instancePath
  await router.push('/')
  showLogDialog()
}

async function onDuplicate(instance: Instance) {
  if (duplicatingPath.value) return
  duplicatingPath.value = instance.path
  try {
    await duplicateInstance(instance.path)
  } finally {
    duplicatingPath.value = ''
  }
}

function onDelete(instance: Instance) {
  showDeleteDialog({ name: instance.name, path: instance.path })
}
</script>

<style scoped>
.filter-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: rgba(226, 232, 240, 0.8);
  cursor: pointer;
  transition: all 0.18s ease;
}

.filter-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.filter-pill--active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(52, 211, 153, 0.45);
  color: #6ee7b7;
}

.instance-bento-card {
  border-radius: 20px !important;
}

.instance-bento-card--active {
  border-color: rgba(52, 211, 153, 0.5) !important;
  box-shadow: inset 0 1px 0 rgba(52, 211, 153, 0.35), 0 16px 36px -12px rgba(16, 185, 129, 0.25) !important;
}

.instance-glyph {
  width: 38px;
  height: 38px;
}

.instance-glyph--emerald {
  background: rgba(16, 185, 129, 0.16);
  border: 1px solid rgba(52, 211, 153, 0.32);
  color: #34d399;
}

.instance-glyph--cyan {
  background: rgba(6, 182, 212, 0.16);
  border: 1px solid rgba(34, 211, 238, 0.32);
  color: #22d3ee;
}

.instance-glyph--amber {
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.32);
  color: #fbbf24;
}
</style>
