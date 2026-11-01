# Etapa 5 — lectores y observadores de metadatos de Mundos

K11 sigue pendiente. Código y ambos ejecutables: `765a054b3fa1f0a2b3c469859bdc1a07a3f6580d`. Se cierra este bloque de lectores; no la inicialización antigua, la conservación al borrar instancias ni la aceptación integral de Mundos.

## Cambios

- `getSharedSaves` y `watch` reutilizan el lector acotado de Mundos. El depósito es fijo y privado; los observadores exigen una instancia Java registrada. No se leen rutas recibidas de eventos de archivos ni se crean carpetas al consultar.
- Se conservan rutas lógicas, enlaces propios, metadatos completos y el recuento legacy de archivos regulares `.json` de jugadores. Este recuento no significa avances completados. Se limita a 10.000 entradas y se comprueba la identidad de la carpeta; no se siguen enlaces de progreso. React conserva `advancements` indefinido en el preview, como antes.
- La procedencia `.curseforge` se lee con un máximo de 64 KiB y devuelve únicamente IDs positivos y seguros. Un sidecar ausente, malformado, excesivo o enlazado no oculta un mundo válido. Se mantienen los límites existentes de NBT/iconos y las comprobaciones de identidad de raíces.
- Un observador vigila las raíces canónicas local y del depósito, sin seguir symlinks y sin recorrer datapacks, regiones ni progreso. Así se actualizan los alias propios del depósito. Las lecturas se agrupan; los estados cerrados no reciben resultados tardíos. Se conservan pausa/reanudación durante cambios, liberación y actualización al salir del juego.
- La fixture85 verifica ahora la raíz canónica realmente observada tras compartir la carpeta. La nueva88 comprueba recuentos/procedencia, rechazo de raíces ajenas, actualizaciones de alias y recuperación al compartir/desconectar. Se ejecuta también en ambas ramas de CI.

## Validación

- **1.343 pruebas unitarias / 130 archivos**, 52,06 s, cuatro workers, ejecución independiente. **72 focales / tres archivos**. Dos casos iniciales no pudieron crear symlinks de archivo sin privilegios de Windows: usan ahora junctions de directorio propios para verificar el rechazo de enlaces, sin permisos adicionales ni aserciones retiradas.
- Tipos Runtime y DeskGap aprobados. Lint: cero errores y un aviso anterior. E2E tsc conserva exactamente **56 diagnósticos base**, sin añadidos ni retirados; no se afirma tsc verde.
- Paquete React: **22/22**, specs66/85/86/87/88, 1,6 min. Paquete Vue: **21/21**, specs03/63/85/86/87/88, 1,7 min. Un worker, cero reintentos. Builds y Native secuenciales; las pruebas usan perfiles propios y el EXE nuevo de cada renderer.
- Los casos de sesiones externas conservan la fixture Java NIO real; no se ejecutó Minecraft. Se comprobaron bytes, copias, enlaces y ausencia de observación de directorios ajenos. Las ventanas de fixtures liberan sus estados al cerrarse; no se quitó el guard de emisor ni se introdujo unref ajeno.
- Regresión de datapacks en claro/oscuro y 1200×720/800×400: **cuatro Axe, cero violaciones y ocho incomplete**. Inspección manual de la captura mínima clara: texto desplazable y acciones visibles. No hay UI nueva ni certificación AA manual global. Los avisos anteriores Buffer/GPU y los errores esperados de llamadas negativas permanecen registrados.
- Build DeskGap en producción aprobado, sin recorrido funcional propio. Nueve pruebas del harness aprobadas; su check se ejecuta tras registrar esta evidencia. El HTML del host conserva el hash del build Vue probado y los paquetes siguen separados.

Comandos desde `launcher`: Vitest con los selectores del workflow y `--maxWorkers=4 --reporter=dot`; checks Runtime/DeskGap y `pnpm lint`; E2E `tsc --noEmit` con comparación normalizada; builds Electron con `LAUNCHER_RENDERER=react|vue`; Playwright con `XMCL_E2E_EXECUTABLE` del renderer correspondiente, `XMCL_E2E_LOCALES=es-ES`, los specs indicados y `--workers=1 --retries=0 --max-failures=1 --reporter=line`; build DeskGap con `NODE_ENV=production` y renderer Vue. Desde raíz: `node --test launcher/scripts/react-migration.test.mjs` y `node launcher/scripts/react-migration.mjs check`.

Manifest ignorado: `launcher/e2e/artifacts/stage5-world-metadata-readers-manifest.json`, SHA-256 `763df4e2c0fa7bd59233aae325478262766100a24e7aaa1c357cac302a63cf99`. Registra ocho fuentes canónicas del commit y 89 artefactos propios, incluidos logs, identidades de los EXE/ASAR y trazas/capturas. Excluye perfiles/cachés, reparse points y las operaciones posteriores de check/PR. No recorre el junction compartido a TEMP.

## Continuación y límites

CI `41355748466` sobre `28039b0`: Vue completó **1.338 unitarias y 30 escenarios Native**; React seguía ejecutándose al registrar este bloque. Es evidencia del commit anterior, no del nuevo. Consultar el CI del SHA exacto después del push; no aceptar un trabajo todavía en curso.

Faltan la inicialización de `InstanceSavesService` (limpieza de snapshots por atime y migración de `shared-saves`), `InstanceService.moveSavesToShared/deleteInstance` y la aceptación integral/noNIO de K11. Los helpers de metadatos de archivos/resource archives que no usan estos consumidores no se declaran auditados por este bloque. La revisión global de IPC/extras sigue en 8.

K12/K21 pass, etapa 5 activa; 6–9 pendientes. Todas las herramientas locales/chunks se conservan. Microsoft pospuesto; producción beta.2 y proxy intactos; PR4 en borrador. DOMPurify WIP y `ANALISIS_ARQUITECTURA.md` preservados y excluidos. Juego real, rendimiento final, accesibilidad/seguridad integral e instalación/actualización aislada siguen pendientes antes de publicar.
