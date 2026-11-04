# Etapa 5: edición revisada de metadatos de mundos

Fuente `90d04eccaebc9cb54b68384871107c3b558af801`. React ya permite revisar y actualizar `levelName`, `difficulty`, `cheat` (`allowCommands`) y `seed` en `level.dat` desde el espacio de instancia con copia de seguridad previa. `K11` y las puertas de la etapa 5 permanecen `pending`.

## Contrato y conservación

- `WorldFileOperation` incorpora la variante discriminada `{ type: 'metadata', instancePath, saveName, metadata: { levelName, seed, difficulty, cheat } }` en `previewWorldFiles` y `applyWorldFiles`.
- `validateWorldMetadata` exige `levelName` no vacío de 1 a 256 caracteres sin caracteres de control (`U+0000`–`U+001F`, `U+007F`), `difficulty` entera en `0..3`, `cheat` booleano y `seed` como entero con signo de 64 bits (`-9223372036854775808`..`9223372036854775807`, o vacía únicamente cuando el mundo no tenía semilla registrada). Si el mundo ya posee semilla, no se permite vaciarla (`WorldMetadataInvalidError`).
- `prepareWorldMetadata` lee `level.dat` mediante `readBoundedFile` (límite de 4 MiB comprimido y 16 MiB descomprimido), valida la estructura con `validateLevelNbt` y parchea únicamente los nodos `LevelName`, `Difficulty`, `allowCommands`, `RandomSeed` y `WorldGenSettings.seed` dentro del compuesto `Data`, conservando intactos el resto de bytes y etiquetas NBT del mundo (`Version`, `GameType`, `Time`, `LastPlayed`, listas vacías y etiquetas de mods) y el formato de compresión original (`gzip`, `deflate` o sin comprimir).
- `previewWorldFiles` devuelve el resumen `metadata: { before, after }` junto con la huella SHA-256 de `level.dat` y la identidad de `worldLocation`. `applyWorldFiles` recalcula el plan, comprueba que `level.dat` y el árbol de ubicación no hayan cambiado (`WorldFilesChangedError`), verifica que no haya partida activa en la instancia (`InstanceRunningError`, incluidos alias físicos) ni en ninguna instancia si el mundo es compartido (`SharedWorldRunningError`), guarda una copia íntegra verificada por SHA-256 en `.backups/world-metadata-<uuid>/<saveName>/level.dat` y sustituye `level.dat` de forma atómica mediante archivo temporal exclusivo en el mismo directorio.
- `WorldFilesDialog` y `InstanceWorlds` muestran la acción `Editar metadatos` por mundo (deshabilitada si `level.dat` es ilegible o el enlace es inseguro), presentan los valores revisados antes de confirmar, advierten cuando el mundo pertenece o enlaza a la carpeta común y permiten abrir la carpeta de respaldo al finalizar.

## Validación

- Suite unitaria del workflow: **1027 pruebas / 101 archivos** en verde, incluidos los nuevos casos en `worldOperations.test.ts` (actualización de metadatos con preservación de etiquetas NBT personalizadas y respaldo en `.backups/world-metadata-*`, rechazo de entradas inválidas y detección de cambios concurrentes en `level.dat`) y `InstanceSavesService.files.test.ts` (registro Java y bloqueo con partida activa o mundo compartido).
- `pnpm check` y `pnpm lint` completos aprobados sin errores; `xmcl-runtime` lint con **0 avisos y 0 errores**; `pnpm --dir e2e exec tsc --noEmit` conserva los **56 diagnósticos previos**.
- Paquete React (`xmcl-electron-app/build/output/react/win-unpacked/Grimo Launcher.exe`): **13 escenarios** (`61`, `62`, `64` y `65-world-metadata.spec.ts`), 43,8 s, `--retries=0`.
- Paquete Vue (`xmcl-electron-app/build/output/win-unpacked/Grimo Launcher.exe`): **2 escenarios** (`03` y `63`), 8,1 s, `--retries=0`. Renderer y host por defecto restaurados a Vue.
- Accesibilidad Axe en los **4 estados nuevos** de revisión de metadatos (`metadata-dark-1200`, `metadata-dark-800`, `metadata-light-1200`, `metadata-light-800`): **0 violaciones / 8 incompletos** (2 por estado por el fondo de ventana). Cierre con `Escape`, devolución de foco al botón de origen y sin desbordamiento horizontal en `1200×720` y `800×400`.
- CI remoto **41254221156** sobre `14209e4` (`46a3771`) finalizado en **`success`** en ambos jobs: `renderer (vue)` (1024 unitarias + 8 E2E Vue) y `renderer (react)` (1024 unitarias + **172 passed / 2 skipped / 0 flaky** en React smoke + 1 StrictMode).
- Manifiesto ignorado `launcher/e2e/artifacts/stage5-world-metadata-manifest.json`: SHA-256 `32bb119543aacd5671b7298c9aa7e99b5b4da31d659da45d56249f830c315478`, **13 blobs Git canónicos** y **71 artefactos**.

## Pendiente

Completar `K11` con la gestión de datapacks por mundo y todas las herramientas locales de mundos confirmadas por el usuario en `SCOPE.md` (progreso/avances/misiones/estadísticas y visor de mapa/dimensiones/regiones con consulta, copia, pegado/reubicación y eliminación de chunks con aislamiento, confirmación y respaldo), seguido de resumen de instancia (`K07`), ajustes base (`K12`, `K13`), consola aislada (`K21`) y las etapas 6 a 9.
