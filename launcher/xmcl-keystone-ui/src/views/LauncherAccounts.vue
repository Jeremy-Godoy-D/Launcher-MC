<template>
  <section class="px-7 py-6 overflow-auto flex flex-col gap-6">
    <header class="flex items-start justify-between gap-4 flex-wrap mc-hairline-b pb-4">
      <div class="max-w-2xl">
        <div class="flex items-baseline gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-[var(--mc-ink)]">Cuentas</h1>
          <span class="mc-tag mc-tabular">{{ savedAccounts.length }} {{ savedAccounts.length === 1 ? 'perfil guardado' : 'perfiles guardados' }}</span>
        </div>
        <p class="text-sm text-[var(--mc-ink-muted)] mt-1 leading-relaxed">
          Gestiona tu cuenta activa para iniciar sesión con Microsoft o jugar con un perfil local sin conexión.
        </p>
      </div>

      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="person_add"
        class="rounded-lg font-semibold text-none px-4"
        data-testid="accounts-open-dialog"
        @click="openLoginDialog"
      >
        Añadir cuenta o perfil local
      </v-btn>
    </header>

    <div class="grid gap-6 lg:grid-cols-12 items-start mc-hairline-b pb-6">
      <div class="lg:col-span-7 flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-[var(--mc-ink)]">Cuenta activa</h2>
          <span class="text-xs text-[var(--mc-ink-muted)]">Cambio instantáneo entre perfiles</span>
        </div>
        <UserAccountSwitcher density="comfortable" show-inline-delete show-refresh />
      </div>

      <div class="lg:col-span-5 flex flex-col gap-2 lg:pl-6 lg:border-l lg:border-[var(--mc-rule)]">
        <h2 class="text-sm font-semibold text-[var(--mc-ink)]">Modos de autenticación</h2>
        <p class="text-xs text-[var(--mc-ink-secondary)] leading-relaxed">
          Un <strong>perfil local</strong> permite jugar en modo sin conexión y probar instancias localmente, pero no da acceso a servidores que exijan verificación oficial de Microsoft.
        </p>
        <p class="text-xs text-[var(--mc-ink-muted)] leading-relaxed pt-1">
          El inicio de sesión con Microsoft utiliza la autenticación oficial de Xbox Live y Minecraft Services.
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-[var(--mc-ink)] mc-tabular">Perfiles guardados ({{ savedAccounts.length }})</h2>
      </div>

      <div v-if="!savedAccounts.length" class="mc-card p-6 text-center text-sm text-[var(--mc-ink-muted)]">
        Todavía no has añadido ninguna cuenta. Pulsa «Añadir cuenta o perfil local» para empezar.
      </div>

      <div v-else class="mc-shelf-grid">
        <article
          v-for="entry in savedAccounts"
          :key="entry.key"
          class="mc-card mc-card-interactive mc-shelf-item flex flex-col justify-between overflow-hidden"
          :class="{ 'account-card--active': entry.isCurrent }"
          :data-testid="`saved-account-${entry.displayName}`"
        >
          <div class="p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-3 min-w-0">
                <PlayerAvatar
                  class="overflow-hidden rounded-lg border border-[var(--mc-rule-strong)] flex-shrink-0"
                  :src="entry.profile?.textures?.SKIN?.url ?? ''"
                  :dimension="38"
                />
                <div class="min-w-0">
                  <div class="font-semibold text-[var(--mc-ink)] truncate">{{ entry.displayName }}</div>
                  <div class="text-xs text-[var(--mc-ink-muted)]">
                    {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'Cuenta Microsoft' : 'Perfil local (sin conexión)' }}
                  </div>
                </div>
              </div>
              <span
                v-if="entry.isCurrent"
                class="mc-tag mc-tag--accent shrink-0"
              >
                Activa
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <span
                class="mc-tag"
                :class="entry.user.authority === AUTHORITY_MICROSOFT ? 'mc-tag--jade' : ''"
              >
                <v-icon size="12">
                  {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'verified' : 'person' }}
                </v-icon>
                {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'Microsoft Oficial' : 'Modo Local / Offline' }}
              </span>
            </div>
          </div>

          <div class="px-4 py-2.5 mc-hairline-t bg-[var(--mc-surface-subtle)] flex items-center">
            <v-btn
              v-if="!entry.isCurrent"
              color="primary"
              variant="tonal"
              size="small"
              class="rounded-md text-none font-semibold"
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
              class="rounded-md text-none"
              @click="confirmRemove(entry)"
            >
              Eliminar
            </v-btn>
          </div>
        </article>
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
import PlayerAvatar from '@/components/PlayerAvatar.vue'
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

<style scoped>
.account-card--active {
  border-color: rgba(224, 109, 83, 0.55) !important;
}
</style>

