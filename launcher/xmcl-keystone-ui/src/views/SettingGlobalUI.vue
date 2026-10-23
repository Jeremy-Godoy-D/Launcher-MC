<template>
  <div>
    <SettingCard class="mb-4" :title="t('setting.themeSettings')" icon="style">
      <AppearanceItems :theme="currentTheme" @save="onSave" />

      <!-- Theme Store Management (always shown) -->
      <v-divider class="my-4" />
      <SettingItem
        :title="t('setting.themeStore.name')"
        :description="t('setting.themeStore.description')"
      >
        <template #action>
          <v-btn variant="outlined" @click="showSaveDialog = true">
            <v-icon start size="small">save</v-icon>
            {{ t('setting.themeStore.saveToStore') }}
          </v-btn>
        </template>
      </SettingItem>

      <!-- Stored Themes List -->
      <div v-if="storedThemes.length > 0" class="px-4 pb-2">
        <div class="text-caption grey--text mb-2">{{ t('setting.themeStore.savedThemes') }}</div>
        <div class="flex flex-wrap gap-2">
          <v-chip
            v-for="theme in storedThemes"
            :key="theme.name"
            closable
            density="compact"
            variant="outlined"
            @click="onLoadTheme(theme.name)"
            @click:close="onDeleteTheme(theme.name)"
          >
            <template #prepend>
              <v-icon size="small">palette</v-icon>
            </template>
            {{ theme.name }}
          </v-chip>
        </div>
      </div>
      <div v-else class="px-4 pb-2 text-caption grey--text">
        {{ t('setting.themeStore.noSavedThemes') }}
      </div>

      <!-- Save Theme Dialog -->
      <v-dialog v-model="showSaveDialog" max-width="400">
        <v-card :title="t('setting.themeStore.saveDialogTitle')">
          <v-card-text>
            <v-text-field
              v-model="newThemeName"
              :label="t('setting.themeStore.themeName')"
              :hint="t('setting.themeStore.themeNameHint')"
              persistent-hint
              autofocus
              @keydown.enter="onSaveToStore"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="showSaveDialog = false" variant="text">{{ t('shared.cancel') }}</v-btn>
            <v-btn
              color="primary"
              :disabled="!newThemeName.trim()"
              @click="onSaveToStore"
              variant="text"
            >
              {{ t('modified.save') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Load Theme Confirmation Dialog -->
      <v-dialog v-model="showLoadConfirmDialog" max-width="400">
        <v-card
          :title="t('setting.themeStore.loadConfirmTitle')"
          :text="t('setting.themeStore.loadConfirmMessage')"
        >
          <v-card-actions>
            <v-spacer />
            <v-btn @click="showLoadConfirmDialog = false" variant="text">{{
              t('shared.cancel')
            }}</v-btn>
            <v-btn color="warning" @click="confirmLoadTheme" variant="text">
              {{ t('setting.themeStore.loadTheme') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <template v-if="env && env.os === 'linux'">
        <v-divider class="my-4" />
        <SettingItemCheckbox
          v-model="linuxTitlebar"
          :title="t('setting.linuxTitlebar')"
          :description="t('setting.linuxTitlebarDescription')"
        />
      </template>
    </SettingCard>

  </div>
</template>

<script setup lang="ts">
import SettingCard from '@/components/SettingCard.vue'
import AppearanceItems from '@/components/AppearanceItems.vue'
import SettingItem from '@/components/SettingItem.vue'
import SettingItemCheckbox from '@/components/SettingItemCheckbox.vue'
import { kEnvironment } from '@/composables/environment'
import { kSettingsState } from '@/composables/setting'
import { kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const env = injection(kEnvironment)
const {
  currentTheme,
  saveCurrentTheme,
  storedThemes,
  saveToStore,
  loadFromStore,
  deleteFromStore,
  refreshStoredThemes,
} = injection(kTheme)
const { state } = injection(kSettingsState)

const linuxTitlebar = computed({
  get: () => state.value?.linuxTitlebar ?? false,
  set: (v) => state.value?.linuxTitlebarSet(v),
})

function onSave() {
  saveCurrentTheme()
}

// --- Theme Store Management ---
const showSaveDialog = ref(false)
const showLoadConfirmDialog = ref(false)
const newThemeName = ref('')
const pendingLoadThemeName = ref('')

async function onSaveToStore() {
  const name = newThemeName.value.trim()
  if (!name) return
  newThemeName.value = ''
  showSaveDialog.value = false
  await saveToStore(name)
}

function onLoadTheme(name: string) {
  pendingLoadThemeName.value = name
  showLoadConfirmDialog.value = true
}

async function confirmLoadTheme() {
  await loadFromStore(pendingLoadThemeName.value)
  showLoadConfirmDialog.value = false
  pendingLoadThemeName.value = ''
}

async function onDeleteTheme(name: string) {
  await deleteFromStore(name)
}

</script>
