<template>
  <section class="p-6 overflow-auto">
    <div class="flex items-center justify-between gap-4 mb-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-semibold">Cuentas</h1>
        <p class="text-sm opacity-80 mt-1">
          Gestiona tu cuenta activa para iniciar sesión con Microsoft o jugar con un perfil local.
        </p>
      </div>
      <v-btn
        color="primary"
        prepend-icon="person_add"
        data-testid="accounts-open-dialog"
        @click="openLoginDialog"
      >
        Añadir cuenta o perfil local
      </v-btn>
    </div>

    <v-alert type="info" variant="tonal" class="mb-6">
      <div>
        Un <strong>perfil local</strong> permite jugar en modo sin conexión y probar instancias localmente, pero no da acceso a servidores ni servicios que exijan autenticación oficial de Microsoft.
      </div>
      <div class="mt-1 text-xs opacity-80">
        El inicio de sesión con Microsoft utiliza exclusivamente la configuración propia de Launcher MC.
      </div>
    </v-alert>

    <div class="mb-6">
      <h2 class="text-base font-semibold mb-2">Cuenta activa</h2>
      <UserAccountSwitcher density="comfortable" show-inline-delete show-refresh />
    </div>

    <div>
      <h2 class="text-base font-semibold mb-3">Perfiles guardados ({{ savedAccounts.length }})</h2>
      <p v-if="!savedAccounts.length" class="text-sm opacity-75">
        Todavía no has añadido ninguna cuenta. Pulsa «Añadir cuenta o perfil local» para empezar.
      </p>
      <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
        <v-card
          v-for="entry in savedAccounts"
          :key="entry.key"
          variant="outlined"
          :data-testid="`saved-account-${entry.displayName}`"
        >
          <v-card-title class="flex items-center justify-between gap-2 text-base">
            <span class="truncate">{{ entry.displayName }}</span>
            <v-chip
              v-if="entry.isCurrent"
              size="x-small"
              color="primary"
              variant="flat"
            >
              Activa
            </v-chip>
          </v-card-title>
          <v-card-subtitle>
            {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'Cuenta Microsoft' : 'Perfil local (sin conexión)' }}
          </v-card-subtitle>
          <v-card-actions>
            <v-btn
              v-if="!entry.isCurrent"
              color="primary"
              variant="text"
              size="small"
              @click="selectAccount(entry)"
            >
              Seleccionar
            </v-btn>
            <v-spacer />
            <v-btn
              color="error"
              variant="text"
              size="small"
              prepend-icon="delete"
              @click="confirmRemove(entry)"
            >
              Eliminar
            </v-btn>
          </v-card-actions>
        </v-card>
      </div>
    </div>

    <SimpleDialog
      v-model="removeDialogShown"
      :title="t('userAccount.removeTitle')"
      :width="360"
      @confirm="onConfirmRemove"
    >
      {{ t('userAccount.removeDescription') }}
    </SimpleDialog>
  </section>
</template>

<script setup lang="ts">
import SimpleDialog from '@/components/SimpleDialog.vue'
import UserAccountSwitcher from '@/components/UserAccountSwitcher.vue'
import { useService } from '@/composables'
import { kUserContext } from '@/composables/user'
import { useUserMenuControl } from '@/composables/userMenu'
import { injection } from '@/util/inject'
import { AUTHORITY_DEV, AUTHORITY_MICROSOFT, GameProfileAndTexture, UserProfile, UserServiceKey } from '@xmcl/runtime-api'

interface SavedAccountEntry {
  key: string
  user: UserProfile
  profile: GameProfileAndTexture | undefined
  displayName: string
  isCurrent: boolean
}

const { t } = useI18n()
const { users, userProfile, select } = injection(kUserContext)
const { removeUser, removeUserGameProfile, selectUserGameProfile } = useService(UserServiceKey)
const { show: showUserDialog } = useUserMenuControl()

const removeDialogShown = ref(false)
const targetToRemove = ref<SavedAccountEntry | undefined>()

const savedAccounts = computed<SavedAccountEntry[]>(() => {
  const entries: SavedAccountEntry[] = []
  for (const u of users.value) {
    const profileIds = Object.keys(u.profiles)
    if (profileIds.length === 0) {
      entries.push({
        key: u.id,
        user: u,
        profile: undefined,
        displayName: u.username,
        isCurrent: u.id === userProfile.value.id,
      })
      continue
    }
    for (const pid of profileIds) {
      const profile = u.profiles[pid]
      entries.push({
        key: `${u.id}:${pid}`,
        user: u,
        profile,
        displayName: profile?.name || u.username,
        isCurrent: u.id === userProfile.value.id && pid === u.selectedProfile,
      })
    }
  }
  return entries
})

function openLoginDialog() {
  showUserDialog('login')
}

async function selectAccount(entry: SavedAccountEntry) {
  if (entry.profile && entry.user.selectedProfile !== entry.profile.id) {
    await selectUserGameProfile(entry.user, entry.profile.id)
  }
  select(entry.user.id)
}

function confirmRemove(entry: SavedAccountEntry) {
  targetToRemove.value = entry
  removeDialogShown.value = true
}

async function onConfirmRemove() {
  const entry = targetToRemove.value
  if (!entry) return
  if (
    entry.user.authority === AUTHORITY_DEV &&
    entry.profile &&
    Object.keys(entry.user.profiles).length > 1
  ) {
    await removeUserGameProfile(entry.user, entry.profile.id)
  } else {
    await removeUser(entry.user)
  }
  removeDialogShown.value = false
  targetToRemove.value = undefined
}
</script>
