# Autoridad de progreso y lecturas de worldgen

Fuente `ae982ece38cba4f29750b4744f18058647cef1ce`, posterior a `2525449`. K11 sigue pendiente; etapa 5 activa. Este bloque protege el contexto de lectura de progreso/worldgen y limita la decodificación de worldgen, sin presentar como seguros todos los lectores internos de progreso.

## Cambios

- `getWorldGenSettings` usa la misma autoridad y bloqueo de lectura que dimensiones, regiones y chunks. Requiere una instancia Java registrada o el depósito propio y comprueba identidad antes/después; una carpeta externa con level.dat no basta.
- `getInstanceSaveProgress` verifica que la instancia solicitada esté registrada y que ese mundo pertenezca realmente a sus guardados, incluidos alias físicos y enlaces compartidos propios. Obtiene versión y carpeta de recursos del registro Native y rechaza recursos de otra instancia. Valida locale antes de incorporarlo a rutas. Reutiliza las guardas existentes y mantiene las comprobaciones después de esperar el bloqueo y terminar la lectura.
- Worldgen lee solo archivos regulares de hasta 4 MiB con identidad/tamaño/fechas verificados; gzip/zlib se expanden hasta 16 MiB y NBT se valida antes de decodificar. Admite gzip, zlib y raw. Ausencia del archivo o de WorldGenSettings devuelve undefined; datos inválidos propagan error y no se presentan como resultado vacío. No modifica bytes.
- Una semilla `0n` de WorldGenSettings se conserva mediante nullish coalescing, en vez de reemplazarla por RandomSeed al evaluarla como falsa.
- Las regresiones existentes de progreso y SNBT entran en la línea unitaria del workflow junto al nuevo test de worldgen. Sin dependencia adicional ni cambio de renderer predeterminado.

## Evidencia

Manifiesto ignorado `launcher/e2e/artifacts/stage5-world-read-manifest.json`, SHA-256 `23990f42ac258e689fd2c9fa2a37ba4f62309c4db68ff4c8bb3dbbb0773c268c`: 6 fuentes canónicas y 37 artefactos. Los ASAR/main y las ocho capturas tienen copias en rutas de este bloque; las rutas compartidas de empaquetado/capturas de informes anteriores son cachés reutilizables.

- Antes del cambio: dos regresiones de autoridad fallaban; tres de worldgen fallaban contra la fuente anterior restaurada temporalmente y recuperada mediante finally. Focal final: **39/39** pruebas en servicio, worldgen, progreso, SNBT y avances. Un intento inicial comparaba 4 MiB con toEqual y agotó el timeout; se comprueba conservación por SHA-256, sin ampliar el timeout.
- Suite exacta Vitest del workflow, sin Electron/builds concurrentes: **1081 pruebas / 108 archivos**, 24,45 s. `pnpm check` aprobado en seis paquetes. Lint sin errores, con el aviso previo no-control-regex en queryModUpdates.ts. E2E TypeScript conserva **56 diagnósticos base**, sin nuevos tras normalizar coordenadas.
- React empaquetado: **7/7** recorridos 61/67, 21,3 s y sin reintentos. La prueba Native ampliada rechaza lecturas de mundo ajeno y de otra instancia, y acepta el progreso/worldgen del mundo propio por IPC real. Se mantienen selección, copia, eliminación, pegado y backup exacto de chunks.
- Vue renderer/host reconstruidos: **2/2** recorridos 03/63, 7,1 s. Dist compartido restaurado Vue. Ocho estados Axe claro/oscuro en ventanas Native 1200×720 y 800×400: cero violaciones y ocho incompletos de contraste; no hay cambios visuales de producto en este bloque ni nueva certificación AA manual.
- Nueve tests del harness aprobados. El check se ejecuta después de registrar este informe; log ignorado `stage5-world-read-harness-check-release.log` fuera del manifiesto para evitar circularidad. El [CI del bloque anterior 41279948321](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41279948321), sobre2525449, tenía Vue aprobado y React aún ejecutándose al registrar esta evidencia. Verificar ambos SHA exactos después de subir; no afirmar verde por adelantado.

Comandos: línea `pnpm exec vitest run ...` del workflow; focal `pnpm exec vitest run xmcl-runtime/save/worldGenSettings.test.ts xmcl-runtime/instance/InstanceSavesService.chunks.test.ts xmcl-runtime/save/progress.test.ts xmcl-runtime/save/snbt.test.ts xmcl-runtime/save/advancements.test.ts`; `pnpm check`, `pnpm lint`, E2E `tsc --noEmit`; builds con `LAUNCHER_RENDERER=react|vue`; Playwright con el EXE empaquetado correspondiente, locale es-ES, specs61/67 o03/63, `--retries=0 --reporter=line`; tests y check del harness. Logs/hashes en el manifiesto. DevTools CLI no se utiliza.

## Pendientes concretos

1. **K11:** asegurar los lectores internos de progreso: `progress.ts` todavía usa readFile/readdir/stat sin los límites del lector de worldgen; sigue enlaces en rutas secundarias, carga JSON/SNBT sin presupuesto global, y extrae imágenes de carpetas/JAR sin límites suficientes. `readTextureFromDisk` permite referencias de modelos recursivas y rutas sin validar; la carrera del timeout de texturas deja trabajo activo. `advancements.ts` todavía resuelve versiones con Version.parse y recorre recursos sin presupuesto; `minecraftLang.ts` lee índices/idiomas heredados. Proteger estas rutas y parseos, sin retirar avances, misiones, estadísticas ni sus recursos locales.
2. Mantener pendiente la detección/bloqueo de `session.lock` para partidas externas. Las guardas actuales cubren procesos administrados por el launcher; no afirmar bloqueo de todo programa que use el mundo. Auditoría de escrituras legacy por IPC en etapa 8.
3. **K12:** argumentos exactos/herencia y cambios sin guardar. **K21:** streaming de dos procesos, fragmentos/lotes, virtualización, scroll y recuperación de copia/exportación. Después catálogo y etapas 7–9 conforme al plan.
4. No se probaron juego/Java reales, instalador/delta aislados ni CPU de 60 s en este bloque. Microsoft pospuesto; datos habituales, proxy y producción intactos. PR4 borrador, versión sin incrementar y dos archivos DOMPurify WIP fuera de commits. No cerrar K11/K12/K21 ni la etapa 5 con esta evidencia parcial.
