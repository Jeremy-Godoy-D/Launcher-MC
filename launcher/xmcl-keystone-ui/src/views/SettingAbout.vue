<template>
  <SettingCard>
    <div class="pa-6 flex flex-col gap-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="lg-eyebrow mb-1">Información del producto</div>
          <h2 class="text-2xl font-bold text-slate-100">Launcher MC</h2>
          <p class="text-sm text-slate-300/85 mt-1">
            Versión <strong>{{ env?.version }}</strong> · Minecraft Java para Windows x64 · Mantenido por <strong>Jeremy Godoy (@Jeremy-Godoy-D)</strong>.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="lg-pill lg-pill--emerald">Licencia MIT</span>
          <span class="lg-pill lg-pill--cyan">Windows x64</span>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-2xl bg-white/4 border border-white/8 p-4">
          <div class="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-1">Base y licencias</div>
          <p class="text-xs text-slate-300/85 leading-relaxed">
            Distribuido bajo licencia MIT respetando íntegramente la licencia MIT de su base X Minecraft Launcher (XMCL) y los avisos de software de terceros (<code>LICENSE.txt</code>, <code>NOTICE.txt</code>, <code>LICENSE-XMCL.txt</code>, <code>THIRD_PARTY_NOTICES.txt</code>).
          </p>
        </div>
        <div class="rounded-2xl bg-white/4 border border-white/8 p-4">
          <div class="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-1">Distribución y actualizaciones</div>
          <p class="text-xs text-slate-300/85 leading-relaxed">
            Soporta actualización directa desde la aplicación (automática o manual) mediante paquetes delta verificados por SHA-256 e instalador ejecutable (<code>.exe</code>) para Windows x64.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 pt-2 border-t border-white/8 flex-wrap">
        <div class="flex gap-4 text-sm font-medium">
          <a href="https://github.com/Jeremy-Godoy-D/Launcher-MC" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">
            Repositorio oficial (GitHub)
          </a>
          <a href="https://github.com/Voxelum/x-minecraft-launcher" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline">
            Proyecto base upstream (XMCL)
          </a>
        </div>
        <span class="text-xs text-slate-400">
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
