<template>
  <section class="library-view px-7 py-6 overflow-auto flex flex-col gap-5">
    <header class="flex flex-col gap-4 mc-hairline-b pb-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="max-w-2xl">
          <div class="flex items-baseline gap-3">
            <h1 class="text-2xl font-bold tracking-tight text-[var(--mc-ink)]">Biblioteca</h1>
            <span class="mc-tag mc-tabular">
              {{ instances.length }} {{ instances.length === 1 ? 'instancia' : 'instancias' }}
            </span>
          </div>
          <p class="text-sm text-[var(--mc-ink-muted)] mt-1 leading-relaxed">
            Cada instancia mantiene sus propios mods, configuración, recursos y mundos de forma independiente.
          </p>
        </div>

        <v-btn
          id="create-instance-button"
          color="primary"
          variant="flat"
          prepend-icon="add"
          class="rounded-lg font-semibold text-none px-4"
          data-testid="library-create-instance"
          @click="show()"
        >
          Crear instancia
        </v-btn>
      </div>

      <div v-if="instances.length > 0" class="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <div class="flex items-center gap-1 flex-wrap" role="group" aria-label="Filtrar por modloader">
          <button
            v-for="opt in loaderFilters"
            :key="opt.id"
            type="button"
            class="mc-filter-tab"
            :class="{ 'mc-filter-tab--active': activeLoaderFilter === opt.id }"
            @click="activeLoaderFilter = opt.id"
          >
            <span>{{ opt.label }}</span>
            <span class="mc-tabular text-[11px] opacity-65 ml-1.5">{{ opt.count }}</span>
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

    <v-alert v-if="error" type="error" class="rounded-lg">
      No se pudo cargar la biblioteca. {{ String(error) }}
    </v-alert>
    <v-progress-linear v-if="isValidating" indeterminate color="primary" aria-label="Cargando biblioteca" />

    <div
      v-if="!instances.length && !isValidating"
      class="mc-card p-8 text-center flex flex-col items-center justify-center gap-3 my-2"
    >
      <div class="h-12 w-12 rounded-lg bg-[var(--mc-accent-soft)] border border-[rgba(224,109,83,0.32)] flex items-center justify-center mb-1">
        <v-icon size="24" color="primary">add_box</v-icon>
      </div>
      <h2 class="text-lg font-semibold text-[var(--mc-ink)]">Sin instancias creadas</h2>
      <p class="text-sm text-[var(--mc-ink-muted)] max-w-md">
        Crea tu primera instancia de Minecraft Java. Cada instancia conserva sus propios mundos, mods y ajustes.
      </p>
      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="add"
        class="mt-2 rounded-lg text-none font-semibold"
        @click="show()"
      >
        Crear primera instancia
      </v-btn>
    </div>

    <div class="mc-shelf-grid">
      <article
        v-for="instance in filteredInstances"
        :key="instance.path"
        class="instance-shelf-card mc-card mc-card-interactive mc-shelf-item flex flex-col justify-between overflow-hidden"
        :class="{ 'instance-shelf-card--active': instance.path === path }"
        @contextmenu.prevent="openContext($event, instance)"
        :data-testid="`instance-card-${instance.name}`"
      >
        <div class="p-4 flex flex-col gap-3">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              <InstanceIcon :instance="instance" :width="56" :height="56" />
              <div class="min-w-0">
                <h2 class="font-semibold text-base text-[var(--mc-ink)] truncate leading-snug" :title="instance.name || `Minecraft ${instance.runtime.minecraft}`">
                  {{ instance.name || `Minecraft ${instance.runtime.minecraft}` }}
                </h2>
                <div class="text-xs text-[var(--mc-ink-muted)] font-mono mc-tabular mt-0.5">
                  MC {{ instance.runtime.minecraft }} · {{ getLoaderName(instance) }}
                </div>
              </div>
            </div>
            <span
              v-if="instance.path === path"
              class="mc-tag mc-tag--accent shrink-0"
            >
              Activa
            </span>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="mc-tag mc-tabular">
              Minecraft {{ instance.runtime.minecraft }}
            </span>
            <span class="mc-tag mc-tabular" :class="getLoaderTagClass(instance)">
              {{ getLoaderName(instance) }}
            </span>
          </div>
        </div>

        <div class="px-4 py-3 mc-hairline-t flex items-center gap-2">
          <v-btn color="primary" variant="flat" size="small" prepend-icon="play_arrow" class="rounded-lg text-none flex-grow" :loading="coordinator.isLaunching(instance.path)" @click="play(instance)">Jugar</v-btn>
          <v-menu location="bottom end">
            <template #activator="{ props }"><v-btn v-bind="props" variant="text" size="small" icon="more_horiz" :aria-label="'Acciones de ' + instance.name" /></template>
            <v-list density="compact"><v-list-item v-for="action in actionsFor(instance)" :key="action.title" :title="action.title" :prepend-icon="action.icon" :color="action.color" @click="action.run()" /></v-list>
          </v-menu>
        </div>
      </article>
    </div>
    <p v-if="instances.length && !filteredInstances.length" class="text-center py-8 text-[var(--mc-ink-muted)]">No hay instancias que coincidan. Prueba otro nombre o filtro.</p>
    <v-menu v-model="contextOpen" :target="contextPoint" location="bottom start"><v-list v-if="contextInstance" density="compact"><v-list-item v-for="action in actionsFor(contextInstance)" :key="action.title" :title="action.title" :prepend-icon="action.icon" :color="action.color" @click="action.run()" /></v-list></v-menu>
  </section>
</template>

<script setup lang="ts">
import InstanceIcon from '@/components/InstanceIcon.vue'
import { kLaunchButton } from '@/composables/launchButton'
import { kInstanceLaunchCoordinator } from '@/composables/instanceLaunchCoordinator'
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

const coordinator = injection(kInstanceLaunchCoordinator)
const { onClick: launchSelected } = injection(kLaunchButton)
const contextOpen = ref(false)
const contextPoint = ref<[number, number]>([0, 0])
const contextInstance = ref<Instance>()
function openContext(event: MouseEvent, instance: Instance) { contextInstance.value = instance; contextPoint.value = [event.clientX, event.clientY]; contextOpen.value = true }
function actionsFor(instance: Instance) {
  return [
    { title: 'Abrir instancia', icon: 'dashboard', run: () => open(instance.path, '/instance') },
    { title: 'Contenido', icon: 'extension', run: () => open(instance.path, '/instance/mods') },
    { title: 'Configuración', icon: 'tune', run: () => open(instance.path, '/instance/base-setting') },
    { title: 'Consola', icon: 'terminal', run: () => openConsole(instance.path) },
    { title: 'Duplicar', icon: 'content_copy', run: () => onDuplicate(instance) },
    { title: 'Eliminar', icon: 'delete', color: 'error', run: () => onDelete(instance) },
  ]
}
async function play(instance: Instance) { path.value = instance.path; await router.push('/'); await nextTick(); launchSelected() }
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

function getLoaderTagClass(instance: Instance) {
  if (instance.runtime.neoForged || instance.runtime.forge) return 'mc-tag--amber'
  return 'mc-tag--jade'
}

function open(instancePath: string, targetRoute = '/') {
  path.value = instancePath
  router.push(targetRoute)
}

async function openConsole(instancePath: string) {
  path.value = instancePath
  await router.push('/instance')
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
.mc-filter-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  color: var(--mc-ink-muted);
  cursor: pointer;
  transition:
    color 150ms var(--mc-ease-out),
    background-color 150ms var(--mc-ease-out),
    border-color 150ms var(--mc-ease-out);
}

.mc-filter-tab:hover {
  background-color: rgba(243, 241, 236, 0.04);
  color: var(--mc-ink);
}

.mc-filter-tab--active {
  background-color: var(--mc-surface);
  border-color: var(--mc-rule-strong);
  color: var(--mc-ink);
  font-weight: 600;
}

.mc-filter-tab--active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background-color: var(--mc-accent);
}

.instance-shelf-card--active {
  border-color: var(--mc-accent) !important;
}

.instance-glyph {
  width: 36px;
  height: 36px;
}

.instance-glyph--jade {
  background-color: var(--mc-jade-soft);
  border: 1px solid rgba(59, 155, 120, 0.32);
  color: #7cd4b2;
}

.instance-glyph--amber {
  background-color: var(--mc-amber-soft);
  border: 1px solid rgba(212, 148, 58, 0.32);
  color: #f0bc6e;
}
</style>

