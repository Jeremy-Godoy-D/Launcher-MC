<template>
  <SettingCard>
    <div class="pa-5 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-4 flex-wrap mc-hairline-b pb-4">
        <div>
          <h2 class="text-xl font-bold tracking-tight text-[var(--mc-ink)]">Launcher MC</h2>
          <p class="text-sm text-[var(--mc-ink-secondary)] mt-1 mc-tabular">
            Versión <strong>{{ env?.version }}</strong> · Minecraft Java para Windows x64 · Mantenido por <strong>Jeremy Godoy (@Jeremy-Godoy-D)</strong>.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="mc-tag mc-tag--jade">Licencia MIT</span>
          <span class="mc-tag mc-tabular">Windows x64</span>
        </div>
      </div>

      <div class="grid gap-6 sm:grid-cols-2 py-1">
        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-semibold text-[var(--mc-ink)]">Base y licencias</h3>
          <p class="text-xs text-[var(--mc-ink-muted)] leading-relaxed">
            Distribuido bajo licencia MIT respetando íntegramente la licencia MIT de su base X Minecraft Launcher (XMCL) y los avisos de software de terceros (<code>LICENSE.txt</code>, <code>NOTICE.txt</code>, <code>LICENSE-XMCL.txt</code>, <code>THIRD_PARTY_NOTICES.txt</code>).
          </p>
        </div>
        <div class="flex flex-col gap-1 sm:pl-6 sm:border-l sm:border-[var(--mc-rule)]">
          <h3 class="text-xs font-semibold text-[var(--mc-ink)]">Distribución y actualizaciones</h3>
          <p class="text-xs text-[var(--mc-ink-muted)] leading-relaxed">
            Soporta actualización directa desde la aplicación (automática o manual) mediante paquetes delta verificados por SHA-256 e instalador ejecutable (<code>.exe</code>) para Windows x64.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 pt-3 mc-hairline-t flex-wrap">
        <div class="flex gap-5 text-xs font-semibold">
          <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC" target="_blank" rel="noopener noreferrer" class="text-[var(--mc-accent)] hover:underline">
            Repositorio oficial (GitHub)
          </a>
          <a href="https://github.com/Voxelum/x-minecraft-launcher" target="_blank" rel="noopener noreferrer" class="text-[var(--mc-jade)] hover:underline">
            Proyecto base upstream (XMCL)
          </a>
        </div>
        <span class="text-xs text-[var(--mc-ink-muted)]">
          Producto independiente. No es un producto oficial de Minecraft ni está aprobado por Mojang o Microsoft.
        </span>
      </div>
    </div>
  </SettingCard>
</template>
<script setup lang="ts">
import SettingCard from '@/components/SettingCard.vue'
import { kEnvironment } from '@/composables/environment'
import { injection } from '@/util/inject'
const env = injection(kEnvironment)
</script>

