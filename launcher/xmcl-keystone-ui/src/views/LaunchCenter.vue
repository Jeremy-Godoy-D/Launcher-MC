<template>
  <section class="aurora-launch-center" data-testid="launch-center">
    <header class="aurora-page-heading">
      <div><h1>Tu próximo mundo</h1><p>Elige una instancia y continúa donde lo dejaste.</p></div>
      <v-btn id="create-instance-button" variant="tonal" prepend-icon="add" data-testid="home-create-instance" @click="show()">Nueva instancia</v-btn>
    </header>
    <div v-if="!instances.length" class="aurora-empty glass-1">
      <v-icon size="64" color="primary">view_in_ar</v-icon>
      <h2>Un mundo por empezar</h2><p>Crea tu primera instancia o descubre un modpack en el catálogo.</p>
      <div class="flex gap-3"><v-btn color="primary" @click="show()">Crear instancia</v-btn><v-btn variant="text" to="/store">Explorar catálogo</v-btn></div>
    </div>
    <div v-else class="aurora-launch-grid">
      <section class="aurora-launch-hero glass-1" data-testid="nav-active-instance">
        <div class="aurora-instance-art"><InstanceIcon :instance="instance" :width="112" :height="112" /></div>
        <div class="aurora-launch-identity"><span class="aurora-status"><i />Instancia seleccionada</span><h2>{{ instance.name || 'Minecraft' }}</h2><p>{{ bedrock ? 'Bedrock Edition' : 'Java Edition' }} · {{ instance.runtime.minecraft }} · {{ loader }}</p></div>
        <div class="aurora-play-zone">
          <button v-if="!bedrock || hasMinecraftLicense" id="launch-button" class="aurora-play-button" data-testid="launch-button" :disabled="isValidating" :aria-label="text" @click="onClick()">
            <v-progress-circular v-if="loading" indeterminate :size="54" :width="3" />
            <v-icon v-else size="52">{{ icon || 'play_arrow' }}</v-icon>
            <span>{{ text }}</span>
          </button>
          <p class="aurora-launch-message" aria-live="polite">{{ loading ? 'Preparando tu partida…' : 'Tus mundos y archivos se conservan en esta instancia.' }}</p>
        </div>
        <div class="aurora-hero-actions">
          <RouterLink to="/instance" data-testid="nav-instance-overview"><v-icon size="18">dashboard</v-icon>Resumen</RouterLink>
          <RouterLink to="/instance/mods" data-testid="nav-instance-content"><v-icon size="18">extension</v-icon>Contenido</RouterLink>
          <RouterLink to="/instance/base-setting" data-testid="nav-instance-settings"><v-icon size="18">tune</v-icon>Ajustes</RouterLink>
          <button type="button" data-testid="nav-instance-console" @click="showLog()"><v-icon size="18">terminal</v-icon>Consola</button>
        </div>
      </section>
      <aside class="aurora-recents">
        <div class="flex items-center justify-between mb-3"><h2>Tu biblioteca</h2><RouterLink to="/me">Ver todas <v-icon size="16">arrow_forward</v-icon></RouterLink></div>
        <button v-for="item in recentInstances" :key="item.path" type="button" class="aurora-recent glass-2" :class="{ selected: path === item.path }" @click="path = item.path">
          <InstanceIcon :instance="item" :width="46" :height="46" />
          <span><strong>{{ item.name }}</strong><small>Minecraft {{ item.runtime.minecraft }}</small></span>
          <v-icon size="20">{{ path === item.path ? 'check_circle' : 'chevron_right' }}</v-icon>
        </button>
        <RouterLink to="/store" class="aurora-discover glass-2"><v-icon size="28">explore</v-icon><strong>Encuentra tu próxima aventura</strong><span>Mods y modpacks para tu estilo de juego</span><v-icon size="20">arrow_forward</v-icon></RouterLink>
      </aside>
    </div>
  </section>
</template>
<script setup lang="ts">
import { useGamepadAction } from '@/composables/gamepad'
import { useHasMinecraftLicense } from '@/composables/minecraftLicense'
import { isBedrockInstance } from '@xmcl/instance'
import InstanceIcon from '@/components/InstanceIcon.vue'
import { kInstance } from '@/composables/instance'
import { kInstances } from '@/composables/instances'
import { kLaunchButton } from '@/composables/launchButton'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { injection } from '@/util/inject'
const { instance, path } = injection(kInstance)
const { hasMinecraftLicense } = useHasMinecraftLicense()
const bedrock = computed(() => isBedrockInstance(instance.value))
const { instances, isValidating } = injection(kInstances)
const { onClick, text, icon, loading } = injection(kLaunchButton)
const { show } = useDialog(AddInstanceDialogKey)
const { show: showLog } = useDialog('log')
const recentInstances = computed(() => [...instances.value].sort((a, b) => b.lastPlayedDate - a.lastPlayedDate).slice(0, 5))
const loader = computed(() => instance.value.runtime.fabricLoader ? 'Fabric' : instance.value.runtime.neoForged ? 'NeoForge' : instance.value.runtime.forge ? 'Forge' : 'Vanilla')
const router = useRouter()
useGamepadAction('X', { label: () => text.value, handler: () => onClick() })
useGamepadAction('Y', { label: () => 'Ajustes de instancia', handler: () => router.push('/instance/base-setting') })
</script>
