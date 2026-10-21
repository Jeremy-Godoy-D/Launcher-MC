<template>
  <section class="p-6 overflow-auto">
    <div class="flex items-center justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold">Biblioteca</h1>
        <p class="text-sm opacity-80 mt-1">
          Cada instancia mantiene sus propios mods, configuración, recursos y mundos de forma independiente.
        </p>
      </div>
      <v-btn
        color="primary"
        prepend-icon="add"
        data-testid="library-create-instance"
        @click="show()"
      >
        Crear instancia
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="mb-4">
      No se pudo cargar la biblioteca. {{ String(error) }}
    </v-alert>
    <v-progress-linear v-if="isValidating" indeterminate aria-label="Cargando biblioteca" class="mb-4" />

    <p v-if="!instances.length && !isValidating" class="mb-6">
      Crea tu primera instancia de Minecraft Java. Cada instancia conserva sus propios mundos, mods y ajustes.
    </p>

    <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
      <v-card
        v-for="instance in instances"
        :key="instance.path"
        variant="outlined"
        :data-testid="`instance-card-${instance.name}`"
      >
        <v-card-title class="flex items-center justify-between gap-2">
          <span class="truncate">{{ instance.name || `Minecraft ${instance.runtime.minecraft}` }}</span>
          <v-chip
            v-if="instance.path === path"
            size="x-small"
            color="primary"
            variant="flat"
          >
            Seleccionada
          </v-chip>
        </v-card-title>
        <v-card-subtitle>
          {{ instance.runtime.minecraft }} · {{ getLoaderName(instance) }}
        </v-card-subtitle>
        <v-card-actions class="flex-wrap gap-1">
          <v-btn color="primary" size="small" @click="open(instance.path, '/')">
            Abrir instancia
          </v-btn>
          <v-btn variant="text" size="small" @click="open(instance.path, '/mods')">
            Contenido
          </v-btn>
          <v-btn variant="text" size="small" @click="open(instance.path, '/base-setting')">
            Configuración
          </v-btn>
          <v-btn variant="text" size="small" @click="openConsole(instance.path)">
            Consola
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            :loading="duplicatingPath === instance.path"
            @click="onDuplicate(instance)"
          >
            Duplicar
          </v-btn>
          <v-btn
            variant="text"
            color="error"
            size="small"
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

function getLoaderName(instance: Instance) {
  if (instance.runtime.fabricLoader) return `Fabric ${instance.runtime.fabricLoader}`
  if (instance.runtime.neoForged) return `NeoForge ${instance.runtime.neoForged}`
  if (instance.runtime.forge) return `Forge ${instance.runtime.forge}`
  return 'Vanilla'
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
