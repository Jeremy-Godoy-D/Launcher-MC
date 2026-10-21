<template>
  <SettingCard>
    <div class="pa-6">
      <h2 class="text-2xl font-semibold mb-4">Launcher MC</h2>
      <p>Versión {{ env?.version }} · Minecraft Java para Windows x64 · Mantenido por <strong>Jeremy Godoy (@Jeremy-Godoy-D)</strong>.</p>
      <p class="mt-4">Distribuido bajo licencia MIT respetando íntegramente la licencia MIT de su base X Minecraft Launcher (XMCL) y los avisos de software de terceros (`LICENSE.txt`, `LICENSE-XMCL.txt`, `THIRD_PARTY_NOTICES.txt`).</p>
      <div class="mt-3 flex gap-4">
        <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC" target="_blank" rel="noopener noreferrer" class="text-primary">Repositorio oficial (GitHub)</a>
        <a href="https://github.com/Voxelum/x-minecraft-launcher" target="_blank" rel="noopener noreferrer" class="text-primary">Proyecto base upstream (XMCL)</a>
      </div>
      <p class="mt-4">Soporta actualización directa desde la aplicación (automática o manual) e instalador ejecutable (`.exe`) para Windows x64.</p>
      <p class="mt-4">Producto independiente. No es un producto oficial de Minecraft ni está aprobado por Mojang o Microsoft.</p>
    </div>
  </SettingCard>
</template>
<script setup lang="ts">
import SettingCard from '@/components/SettingCard.vue'
import { kEnvironment } from '@/composables/environment'
import { injection } from '@/util/inject'
const env = injection(kEnvironment)
</script>
