<template>
  <v-dialog
    v-model="isShown"
    width="800"
    @input="$emit('input', $event)"
  >
    <v-card
      v-if="updateInfo"
      outlined
      class="update-info-card flex flex-col overflow-hidden"
      data-testid="update-info-dialog"
    >
      <v-alert
        v-if="isAppX"
        variant="tonal"
        type="warning"
      >
        {{ t('setting.appxUpdateHint') }}
      </v-alert>
      <v-card-item class="shrink-0">
        <v-card-title>
          {{ updateInfo.name }}
        </v-card-title>
        <v-card-subtitle>
          {{ getLocalDateString(updateInfo.date) }}
        </v-card-subtitle>
      </v-card-item>
      <v-card-text class="markdown-body min-h-0 flex-1 overflow-auto" data-testid="update-release-notes">
        <div v-html="body" />
      </v-card-text>
      <v-alert
        v-if="hintRedownload"
        variant="tonal"
        type="warning"
        class="shrink-0"
      >
        Descarga el instalador completo, cierra el launcher y ejecútalo. Conserva tu carpeta de datos y mundos.
      </v-alert>
      <v-card-actions class="flex-wrap shrink-0">
        <v-btn
          variant="text"
          @click="openExeInstaller()"
          data-testid="update-download-installer"
        >
          <v-icon start>
            download
          </v-icon>
          Descargar instalador (.exe)
        </v-btn>
        <v-btn
          variant="text"
          @click="openGithub()"
        >
          <v-icon start>
            signpost
          </v-icon>
          {{ t('setting.githubRelease') }}
        </v-btn>
        <v-spacer />
        <template v-if="!hintRedownload">
          <v-btn
            v-if="updateStatus === 'pending'"
            color="primary"
            :loading="downloadingUpdate"
            :disabled="downloadingUpdate"
            variant="text"
            @click="downloadUpdate()"
          >
            <v-icon start>
              cloud_download
            </v-icon>
            {{ t('launcherUpdate.updateToThisVersion') }}
          </v-btn>
          <v-btn
            v-else
            color="primary"
            :loading="installing"
            @click="quitAndInstall()"
          >
            <v-icon start>
              refresh
            </v-icon>
            {{ t('launcherUpdate.installAndQuit') }}
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
    <v-card
      v-else
      hover
      style="width: 100%"
      to="https://github.com/Jeremy-Godoy-D/Launcher-MC/releases"
      target="browser"
      push
    >
      <div class="m-8 flex h-full items-center justify-around">
        <h3 v-if="!checkingUpdate">
          {{ t('launcherUpdate.noUpdateAvailable') }}
        </h3>
        <v-progress-circular
          v-else
          indeterminate
        />
      </div>
    </v-card>
  </v-dialog>
</template>

<script lang=ts setup>
import { kEnvironment } from '@/composables/environment'
import { useMarkdown } from '@/composables/markdown'
import { kSettingsState, kUpdateSettings } from '@/composables/setting'
import { getLocalDateString } from '@/util/date'
import { injection } from '@/util/inject'
import { useDialog } from '../composables/dialog'

const { isShown } = useDialog('update-info')
const { t } = useI18n()
const { render } = useMarkdown()
const { state } = injection(kSettingsState)
const {
  installing, downloadingUpdate, checkingUpdate, updateInfo, updateStatus,
  downloadUpdate, quitAndInstall,
} = injection(kUpdateSettings)

function renderUpdate() {
  const body = state.value?.updateInfo?.body ?? ''
  const transformed = body.replace(/## \[(.+)\]\(#.+\)/g, (str, v) => `## ${v}`)
  return render(transformed)
}
const body = computed(() => state.value?.updateInfo?.operation === 'autoupdater' ? state.value?.updateInfo.body : renderUpdate())
const env = injection(kEnvironment)
const isAppX = computed(() => env.value?.env === 'appx')
const hintRedownload = computed(() =>
  state.value?.updateInfo?.operation === 'manual',
)

const openExeInstaller = () => {
  const exeAsset = state.value?.updateInfo?.files?.find((f) => f.name.endsWith('.exe'))
  window.open(exeAsset?.url || 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases', 'browser')
}
const openGithub = () => {
  window.open('https://github.com/Jeremy-Godoy-D/Launcher-MC/releases', 'browser')
}
</script>

<style scoped>
.update-info-card { max-height: calc(100dvh - 32px); }
</style>
