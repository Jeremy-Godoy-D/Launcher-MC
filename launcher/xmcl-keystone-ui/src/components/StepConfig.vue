<template>
  <div
    ref="scrollElement"
    class="overflow-auto max-h-[70vh] px-[24px] pt-[24px] pb-[16px]"
  >
    <div class="aurora-config-tabs" role="tablist" aria-label="Crear instancia">
      <button type="button" role="tab" :aria-selected="stage === 1" :class="{ active: stage === 1 }" @click="stage = 1">Versión y loader</button>
      <button type="button" role="tab" :aria-selected="stage === 2" :class="{ active: stage === 2 }" @click="stage = 2">Nombre y detalles</button>
    </div>
    <StepperAdvanceContent v-show="stage === 1" v-if="content.edition !== 'bedrock'" :valid="valid" class="z-1 relative" />
    <v-btn v-if="stage === 1" class="my-4 relative z-1" color="primary" append-icon="arrow_forward" data-testid="add-instance-details-next" @click="stage = 2">Continuar</v-btn>
    <v-form v-show="stage === 2"
      lazy-validation
      style="height: 100%;"
      :value="valid"
      class="z-1 relative"
      @input="onUpdate"
    >
      <div class="grid grid-cols-4 gap-4 mb-4">
        <v-text-field
          v-model="content.name"
          data-testid="add-instance-name"
          variant="outlined"
          autofocus
          :class="content.edition === 'bedrock' ? 'col-span-4' : 'col-span-2'"
          :loading="loading"
          :disabled="loading"
          persistent-hint
          persistent-placeholder
          :hint="t('instance.nameHint')"
          :placeholder="placeHolderName"
          :label="t('shared.name')"
          :rules="nameRules"
          required
        />
        <v-text-field
          v-if="content.edition !== 'bedrock'"
          v-model="content.author"
          :loading="loading"
          :disabled="loading"
          variant="outlined"
          class="col-span-2"
          persistent-hint
          :hint="t('modpack.authorHint')"
          :label="t('shared.author')"
        />
        <v-text-field
          v-model="content.description"
          :loading="loading"
          :disabled="loading"
          class="col-span-4"
          variant="outlined"
          persistent-hint
          :hint="t('modpack.descriptionHint')"
          :label="t('shared.description')"
        />
      </div>
    </v-form>
    <slot name="collection" />
    <v-list-subheader v-if="loading || error || files.length > 0">
      {{ t('instanceTemplate.preview') }}
    </v-list-subheader>
    <v-skeleton-loader
      v-if="loading"
      type="list-item-avatar-two-line,list-item-avatar-two-line,list-item-avatar-two-line,list-item-avatar-two-line,list-item-avatar-two-line"
    />
    <ErrorView
      v-else-if="error"
      class="px-7"
      :error="error"
      no-refresh
    />
    <InstanceManifestFileTree
      v-else-if="files.length > 0 && stage === 2"
      :model-value="[]"
      :scroll-element="scrollElement"
    />
  </div>
</template>

<script lang=ts setup>
import { provideFileNodes } from '@/composables/instanceFileNodeData'
import { kInstances } from '@/composables/instances'
import { basename } from '@/util/basename'
import { injection } from '@/util/inject'
import { required } from '@/util/props'
import { kInstanceCreation } from '../composables/instanceCreation'
import { getEffectiveInstanceName, validateInstanceName } from '@/util/instanceName'
import ErrorView from './ErrorView.vue'
import InstanceManifestFileTree from './InstanceManifestFileTree.vue'
import StepperAdvanceContent from './StepperAdvanceContent.vue'

defineProps({
  valid: required(Boolean),
})
const emit = defineEmits(['update:valid'])
const { t } = useI18n()
const { data: content, files, loading, error, placeHolderName } = injection(kInstanceCreation)
const { instances } = injection(kInstances)

const nameValidationErrors: Record<string, string> = {
  invalidChars: 'instance.nameInvalidChars',
  reservedName: 'instance.nameReservedName',
  pathTraversal: 'instance.namePathTraversal',
  whitespaceOnly: 'instance.nameWhitespaceOnly',
  trailingDotOrSpace: 'instance.nameTrailingDotOrSpace',
}
const nameRules = computed(() => [
  (v: any) => {
    const effectiveName = getEffectiveInstanceName(v, placeHolderName.value)
    if (!effectiveName) return t('instance.nameWhitespaceOnly')
    return !instances.value.some(i => i.name === effectiveName) || t('instance.duplicatedName')
  },
  (v: any) => {
    if (!v) return true // empty is allowed, will use placeholder
    const result = validateInstanceName(v)
    if (result === true) return true
    return t(nameValidationErrors[result] ?? 'instance.nameInvalidChars')
  },
  (v: any) => !/\p{Script=Cyrillic}/u.test(v) || t('instance.nameNoCyrillic'),
])

const stage = ref(1)
watchEffect(() => emit('update:valid', stage.value === 2 && nameRules.value.every(rule => rule(content.name) === true)))

const scrollElement = ref<HTMLElement | null>(null)

const onUpdate = ($event: any) => {
  emit('update:valid', stage.value === 2 && $event)
}

provideFileNodes(computed(() => files.value.map(f => ({
  path: f.path,
  name: basename(f.path, '/'),
  size: f.size ?? 0,
})) ?? []))

</script>
