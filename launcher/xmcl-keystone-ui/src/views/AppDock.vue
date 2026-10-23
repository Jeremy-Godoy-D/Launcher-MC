<template>
  <nav class="aurora-dock non-moveable glass-1" aria-label="Navegación principal" data-testid="app-sidebar">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to" :data-testid="item.testId"
      class="aurora-dock-link" :class="{ active: item.to === '/' ? route.path === '/' || route.path.startsWith('/instance') : route.path.startsWith(item.to) }"
      :aria-current="(item.to === '/' ? route.path === '/' : route.path.startsWith(item.to)) ? 'page' : undefined">
      <v-icon size="23">{{ item.icon }}</v-icon><span>{{ item.label }}</span>
    </RouterLink>
    <span class="aurora-dock-divider" />
    <v-menu v-model="accountsOpen" location="top end" :close-on-content-click="false" offset="16" max-width="440">
      <template #activator="{ props }">
        <button id="my-stuff-button" v-bind="props" type="button" class="aurora-dock-link" data-testid="nav-accounts" aria-label="Cuentas" :aria-expanded="accountsOpen">
          <PlayerAvatar v-if="gameProfile.name" :src="gameProfile.textures.SKIN.url" :dimension="24" /><v-icon v-else size="23">account_circle</v-icon><span>Cuentas</span>
        </button>
      </template>
      <div class="glass-3 aurora-account-popover">
        <h2 class="text-lg font-semibold mb-3">Tus cuentas</h2>
        <UserAccountSwitcher comfortable show-inline-delete />
        <v-btn class="mt-3" block variant="text" to="/accounts" @click="accountsOpen = false">Gestionar cuentas</v-btn>
      </div>
    </v-menu>
  </nav>
</template>
<script setup lang="ts">
import UserAccountSwitcher from '@/components/UserAccountSwitcher.vue'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { kUserContext } from '@/composables/user'
import { injection } from '@/util/inject'
const { gameProfile } = injection(kUserContext)
const route = useRoute()
const accountsOpen = ref(false)
const items = [
  { to: '/', label: 'Inicio', icon: 'play_circle', testId: 'nav-home' },
  { to: '/me', label: 'Biblioteca', icon: 'grid_view', testId: 'nav-library' },
  { to: '/store', label: 'Catálogo', icon: 'travel_explore', testId: 'nav-store' },
  { to: '/setting', label: 'Ajustes', icon: 'tune', testId: 'nav-settings' },
]
</script>
