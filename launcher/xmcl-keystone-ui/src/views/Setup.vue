<template>
  <div v-if="!data.fetching" data-testid="setup-root" class="aurora-onboarding">
    <aside class="aurora-onboarding-intro">
      <v-icon size="64" color="primary">view_in_ar</v-icon><h1>Tu mundo.<br>Tu manera de jugar.</h1><p>Minecraft Java, tus instancias y todo lo que las hace tuyas.</p>
      <ol class="aurora-setup-progress"><li v-for="(label, index) in ['Bienvenida', 'Tu cuenta', 'A jugar']" :key="label" :class="{ active: data.step === index + 1, complete: data.step > index + 1 }"><span>{{ index + 1 }}</span>{{ label }}</li></ol>
    </aside>
    <div class="aurora-onboarding-form glass-1">
      <div class="overflow-y-auto flex-1 min-h-0">
        <div v-if="data.step === 1"><SetLocale v-model="localeRef" /><details class="mx-6 my-4"><summary class="cursor-pointer py-3">Opciones avanzadas</summary><SetDataRoot v-model="data.path" :error="data.pathError" :default-path="data.defaultPath" :drives="data.drives" /><SetupAppearance v-model="data.path" :default-path="data.defaultPath" :drives="data.drives" /></details></div>
        <SetupAccount v-else-if="data.step === 2" v-model="data.instancePath" :loading="data.loading" @skip="next" />
        <div v-else class="pa-6"><h2 class="text-2xl font-semibold mb-3">Todo listo para empezar</h2><p class="text-[var(--mc-ink-muted)] mb-6">Crea una instancia de Minecraft o explora los modpacks disponibles.</p><v-radio-group v-model="data.firstAction"><v-radio label="Crear mi primera instancia" value="create" /><v-radio label="Explorar el catálogo" value="store" /></v-radio-group></div>
      </div>
      <SetupFooter :prev="data.step !== 1" next :disabled="hasError" :loading="data.loading" :finish="data.step === 3" @prev="prev" @next="data.step === 3 ? setup() : next()" />
    </div>
  </div>
  <div v-else class="flex h-full w-full items-center justify-center"><v-progress-circular indeterminate color="primary" /></div>
</template>

<script lang="ts" setup>
import AppMoodBackground from '@/components/AppMoodBackground.vue'
import AppMoodSurface from '@/components/AppMoodSurface.vue'
import { useService } from '@/composables'
import { kSettingsState } from '@/composables/setting'
import { BackgroundType, kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'
import { BaseServiceKey, Drive, InvalidDirectoryErrorCode } from '@xmcl/runtime-api'
import SetupAccount from './SetupAccount.vue'
import SetupAppearance from './SetupAppearance.vue'
import SetDataRoot from './SetupDataRoot.vue'
import SetupFooter from './SetupFooter.vue'
import SetLocale from './SetupLocale.vue'

const emit = defineEmits(['ready'])
const { validateDataDictionary, getEnvironment } = useService(BaseServiceKey)

const next = () => {
  data.step = Number(data.step) + 1
}
const prev = () => {
  data.step = Number(data.step) - 1
}

const { locale, t } = useI18n()
const localeRef = computed({
  get: () => state.value?.locale ?? locale.value,
  set: (v) => {
    state.value?.localeSet(v ?? locale.value)
  },
})

const data = reactive({
  step: 1,
  fetching: true,
  minecraftPath: '',
  instancePath: '',
  path: '',
  pathError: '' as InvalidDirectoryErrorCode,
  defaultPath: '',
  loading: false,
  drives: [] as Drive[],
  theme: 'dark',
  firstAction: 'create',
})
provide('setup', data)
bootstrap.preset().then(({ minecraftPath, defaultPath, locale: locale_, drives }) => {
  data.fetching = false
  if (locale_.startsWith('en')) {
    locale_ = 'en'
  }
  locale.value = locale_
  data.minecraftPath = minecraftPath
  data.instancePath = minecraftPath
  data.path = defaultPath
  data.defaultPath = defaultPath
  data.drives = drives
})

const hasError = computed(() => !!data.pathError && data.pathError !== 'exists')
watch(() => data.path, (newPath) => {
  data.loading = true
  data.pathError = undefined
  validateDataDictionary(newPath).then((reason) => {
    data.loading = false
    if (!reason) {
      data.path = newPath
    } else {
      data.pathError = reason
    }
  })
})

const { isDark, currentTheme, saveCurrentTheme } = injection(kTheme)

const updateTheme = (theme: 'dark' | 'system' | 'light') => {
  if (theme === 'system') {
    currentTheme.value.dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } else if (theme === 'dark') {
    currentTheme.value.dark = true
  } else {
    currentTheme.value.dark = false
  }
}

updateTheme(data.theme as any)

watch(() => data.theme, () => {
  updateTheme(data.theme as any)
})

const { state } = injection(kSettingsState)

async function persistInitialTheme() {
  try {
    await getEnvironment()
    currentTheme.value.backgroundType = BackgroundType.BUBBLES
  } catch (err) {
    console.error('Failed to detect environment during setup', err)
  }
  try {
    await saveCurrentTheme()
  } catch (err) {
    console.error('Failed to persist initial theme during setup', err)
  }
}

async function setup() {
  if (data.loading) return
  data.loading = true
  try {
    await bootstrap.bootstrap(data.path)
  } catch (err) {
    data.loading = false
    throw err
  }
  emit('ready', data)
  if (state.value) {
    state.value.localeSet(locale.value)
  } else {
    const dismiss = watch(state, (s) => {
      if (s) {
        s.localeSet(locale.value)
        dismiss()
      }
    })
  }
  // Environment detection may wait on the network. It should never block the
  // user from leaving onboarding after the data root has been accepted.
  void persistInitialTheme()
}
</script>

<style>
.setup .v-stepper-header {
  flex: 0 0 auto;
}

.setup-stepper-header {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  backdrop-filter: blur(10px);
}

.setup-stepper-item {
  border-radius: 12px;
  transition:
    background-color 0.18s ease,
    transform 0.18s ease;
}

.setup-stepper-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
  transform: translateY(-1px);
}

.setup .v-stepper-window {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  overflow: hidden;
}

.setup .v-stepper-window .v-window__container {
  height: 100%;
}

.setup .v-stepper-window-item {
  height: 100%;
  overflow: auto;
  overflow-x: hidden;
}

.setup-pane-wrap {
  padding: 12px 16px 16px;
}

.setup .v-stepper.v-sheet {
  overflow: hidden;
}

.setup-step-forward-enter-active,
.setup-step-forward-leave-active,
.setup-step-back-enter-active,
.setup-step-back-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.setup-step-forward-enter-from,
.setup-step-back-leave-to {
  opacity: 0;
  transform: translateX(22px) scale(0.985);
}

.setup-step-forward-leave-to,
.setup-step-back-enter-from {
  opacity: 0;
  transform: translateX(-22px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .setup-step-forward-enter-active,
  .setup-step-forward-leave-active,
  .setup-step-back-enter-active,
  .setup-step-back-leave-active,
  .setup-stepper-item {
    transition: none;
  }
}

</style>
