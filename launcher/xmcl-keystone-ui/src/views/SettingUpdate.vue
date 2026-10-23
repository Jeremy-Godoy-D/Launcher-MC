<template>
  <SettingCard
    v-if="!disableUpdate"
    :title="t('setting.update')"
    icon="rocket_launch"
  >
    <SettingItem>
      <template #preaction>
        <v-btn
          data-testid="settings-check-update"
          v-shared-tooltip="() => t('setting.checkUpdate')"
          icon
          variant="text"
          :loading="checkingUpdate"
          @click="checkUpdate"
        >
          <v-icon>refresh</v-icon>
        </v-btn>
      </template>
      
      <template #title>
        {{ t("setting.latestVersion") }}
      </template>

      <template #subtitle>
        <span :class="{'success--text': !hasNewUpdate, 'primary--text': hasNewUpdate}">
          v{{ version }}
          {{ hasNewUpdate && updateInfo ? `-> ${updateInfo.name}` : "" }}
        </span>
        <v-chip
          v-if="hasNewUpdate"
          size="x-small"
          color="primary"
          class="ml-2"
          label
        >
          NEW
        </v-chip>
      </template>
      
      <template #action>
        <v-btn
          data-testid="settings-update-details"
          :loading="checkingUpdate || downloadingUpdate || installing"
          :disabled="updateStatus === 'none'"
          :color="updateStatus !== 'none' ? 'primary' : ''"
          :outlined="updateStatus === 'none'"
          @click="showUpdateInfo()"
          size="small"
        >
          <v-icon start size="small" v-if="updateStatus !== 'none'">system_update</v-icon>
          {{
            updateStatus === "none"
              ? t("launcherUpdate.alreadyLatest")
              : updateInfo?.operation === 'manual'
                ? 'Ver actualización'
              : updateStatus === "pending"
                ? t("launcherUpdate.updateToThisVersion")
                : t("launcherUpdate.installAndQuit")
          }}
        </v-btn>
      </template>
    </SettingItem>

    <SettingItemCheckbox
      v-model="autoUpdate"
      title="Actualizaciones automáticas"
      description="Buscar nuevas versiones al iniciar. Si una versión requiere el instalador completo, podrás descargarlo desde su ficha."
    />
  </SettingCard>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { injection } from '@/util/inject'
import { useDialog } from '../composables/dialog'
import { kUpdateSettings } from '../composables/setting'
import SettingCard from '@/components/SettingCard.vue'
import SettingItem from '@/components/SettingItem.vue'
import SettingItemCheckbox from '@/components/SettingItemCheckbox.vue'

const { show: showUpdateInfo } = useDialog('update-info')
const disableUpdate = false
const autoUpdate = useLocalStorage('launcherMcAutoUpdate', true)
const { updateInfo, installing, downloadingUpdate, downloadUpdate, updateStatus, checkUpdate, checkingUpdate, version } = injection(kUpdateSettings)
const hasNewUpdate = computed(() => updateStatus.value !== 'none' && !!updateInfo.value?.newUpdate)
const { t } = useI18n()

onMounted(() => {
  if (autoUpdate.value) {
    checkUpdate().catch(() => {})
  }
})

watch([updateStatus, autoUpdate], ([status, isAuto]) => {
  if (isAuto && status === 'pending' && updateInfo.value?.operation !== 'manual' && !downloadingUpdate.value) {
    downloadUpdate().catch(() => {})
  }
})

</script>

<style scoped>
:deep(.transparent-list) {
  background: transparent !important;
}

.v-card {
  transition: all 0.2s ease;
}

.v-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
