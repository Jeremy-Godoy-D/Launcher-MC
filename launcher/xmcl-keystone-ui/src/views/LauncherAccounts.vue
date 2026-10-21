<template>
  <section class="p-6 overflow-auto flex flex-col gap-5">
    <header class="lg-surface rounded-3xl p-6 flex items-start justify-between gap-4 flex-wrap">
      <div class="max-w-2xl">
        <div class="lg-eyebrow mb-1.5 flex items-center gap-2">
          <v-icon size="14" color="#34d399">verified_user</v-icon>
          <span>Identidad y autenticación</span>
        </div>
        <h1 class="lg-hero-title">Cuentas</h1>
        <p class="text-sm text-slate-300/80 mt-1.5 leading-relaxed">
          Gestiona tu cuenta activa para iniciar sesión con Microsoft o jugar con un perfil local.
        </p>
      </div>

      <v-btn
        color="primary"
        prepend-icon="person_add"
        class="rounded-xl font-semibold text-none px-5 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.55)]"
        data-testid="accounts-open-dialog"
        @click="openLoginDialog"
      >
        Añadir cuenta o perfil local
      </v-btn>
    </header>

    <div class="grid gap-4 lg:grid-cols-12">
      <div class="lg:col-span-7 lg-inset p-5 flex flex-col justify-between gap-3">
        <div>
          <div class="lg-eyebrow mb-1">Sesión principal</div>
          <h2 class="text-base font-bold text-slate-100 mb-3">Cuenta activa</h2>
          <UserAccountSwitcher density="comfortable" show-inline-delete show-refresh />
        </div>
        <div class="text-xs text-slate-400 pt-2 border-t border-white/8 flex items-center justify-between flex-wrap gap-2">
          <span>Cambio instantáneo entre múltiples perfiles guardados</span>
          <span class="lg-pill lg-pill--emerald text-[11px]!">{{ savedAccounts.length }} guardados</span>
        </div>
      </div>

      <div class="lg:col-span-5 lg-inset p-5 flex flex-col justify-between gap-3">
        <div>
          <div class="lg-eyebrow mb-1">Modos soportados</div>
          <h2 class="text-base font-bold text-slate-100 mb-2">Diferencias de autenticación</h2>
          <p class="text-xs text-slate-300/85 leading-relaxed">
            Un <strong>perfil local</strong> permite jugar en modo sin conexión y probar instancias localmente, pero no da acceso a servidores ni servicios que exijan autenticación oficial de Microsoft.
          </p>
        </div>
        <div class="rounded-xl bg-white/4 border border-white/8 p-3 text-xs text-slate-300/80">
          El inicio de sesión con Microsoft utiliza exclusivamente la configuración propia de Launcher MC.
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-bold text-slate-100">Perfiles guardados ({{ savedAccounts.length }})</h2>
      </div>

      <div v-if="!savedAccounts.length" class="lg-inset p-6 text-center text-sm text-slate-300/80">
        Todavía no has añadido ninguna cuenta. Pulsa «Añadir cuenta o perfil local» para empezar.
      </div>

      <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(290px, 1fr))">
        <v-card
          v-for="entry in savedAccounts"
          :key="entry.key"
          variant="outlined"
          class="lg-inset lg-inset-interactive overflow-hidden"
          :class="{ 'account-card--active': entry.isCurrent }"
          :data-testid="`saved-account-${entry.displayName}`"
        >
          <v-card-title class="flex items-center justify-between gap-2 pt-4 px-4 pb-1 text-base">
            <div class="flex items-center gap-3 min-w-0">
              <PlayerAvatar
                class="overflow-hidden rounded-full border border-white/15 flex-shrink-0"
                :src="entry.profile?.textures?.SKIN?.url ?? ''"
                :dimension="38"
              />
              <div class="min-w-0">
                <div class="font-bold text-slate-100 truncate">{{ entry.displayName }}</div>
                <div class="text-xs text-slate-300/75">
                  {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'Cuenta Microsoft' : 'Perfil local (sin conexión)' }}
                </div>
              </div>
            </div>
            <v-chip
              v-if="entry.isCurrent"
              size="x-small"
              color="primary"
              variant="flat"
              class="font-semibold"
            >
              Activa
            </v-chip>
          </v-card-title>

          <v-card-subtitle class="px-4 pt-2 pb-3 opacity-100!">
            <span
              class="lg-pill text-[11px]!"
              :class="entry.user.authority === AUTHORITY_MICROSOFT ? 'lg-pill--cyan' : 'lg-pill--emerald'"
            >
              <v-icon size="12">
                {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'verified' : 'person' }}
              </v-icon>
              {{ entry.user.authority === AUTHORITY_MICROSOFT ? 'Microsoft Oficial' : 'Modo Local / Offline' }}
            </span>
          </v-card-subtitle>

          <v-card-actions class="px-4 py-2.5 border-t border-white/8 bg-black/20">
            <v-btn
              v-if="!entry.isCurrent"
              color="primary"
              variant="tonal"
              size="small"
              class="rounded-lg text-none font-semibold"
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
              class="rounded-lg text-none"
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
  border-color: rgba(52, 211, 153, 0.5) !important;
  box-shadow: inset 0 1px 0 rgba(52, 211, 153, 0.35), 0 14px 32px -12px rgba(16, 185, 129, 0.25) !important;
}
</style>
