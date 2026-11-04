# Etapa 5: herramientas locales de mundos, visor de progreso, mapa y operaciones de chunks

Fuente `1dccd35`. React incorpora el visor interactivo de progreso (avances, misiones y estadísticas), el visor de mapa 2D de dimensiones y regiones, y las operaciones completas sobre chunks (selección, copia en portapapeles, pegado y eliminación con confirmación revisada, bloqueos por partida activa y respaldo automático de archivos `.mca`), cumpliendo la totalidad de herramientas locales de mundos requeridas por el usuario en `SCOPE.md`.

## Contrato y conservación

- **Visor de progreso de partida** (`WorldProgress`): pestañas para avances nativos (`advancements`), misiones locales (`quests` FTB Quests) y estadísticas de juego (`stats`), con búsqueda en tiempo real (`progress-filter`), alternancia de visualización en lista o árbol (`progress-view-mode`), desglose numérico de criterios completados y actualización manual (`progress-refresh`).
- **Visor interactivo de mapa 2D** (`WorldMap`):
  - Selector de dimensiones disponibles (`save-world-map-dim`: Overworld, Nether, The End y dimensiones personalizadas presentes en el guardado).
  - Renderizado dinámico de regiones a 512x512 píxeles mediante `InstanceSavesService.renderSaveRegion`, con caché local en memoria de `ImageBitmap` y gestión de concurrencia.
  - Control de altura Y regulable mediante control deslizante (`save-world-map-height`) acotado según la dimensión seleccionada (-64 a 320 en Overworld; 0 a 256 en Nether/End) o modo superficie completa.
  - Alternador de cuadrícula de regiones (`save-world-map-grid-toggle`), botón de centrado y restablecimiento de vista (`save-world-map-reset`), zoom mediante rueda de ratón y desplazamiento interactivo (*pan*) con arrastre del cursor.
- **Operaciones sobre chunks con confirmación y respaldo**:
  - Selección interactiva de chunks mediante clic o combinaciones de teclado (Ctrl + clic para alternar selección múltiple, Shift + clic para deseleccionar), mostrando indicador de cantidad (`save-world-map-selected-count`) y botón para limpiar selección (`save-world-map-clear-selection`).
  - Portapapeles reactivo de chunks (`savesChunkClipboard`): botón de copia (`save-world-map-copy`) que extrae los datos NBT de los chunks seleccionados mediante `copySaveChunks`, y botón de pegado (`save-world-map-paste`) que aplica los chunks copiados con compensación de desplazamiento (*offset*) mediante `pasteSaveChunks`.
  - Eliminación de chunks (`save-world-map-delete`) con diálogo modal de confirmación (`confirm-dialog`) que advierte sobre los cambios irreversibles y la creación automática de respaldo.
- **Guardas de seguridad en tiempo de ejecución** (`InstanceSavesService`):
  - `#assertSaveWritable`: verifica la existencia y legibilidad de `level.dat`, comprueba el aislamiento de rutas canónicas en mundos de instancia o compartidos, y bloquea cualquier modificación si la instancia local está en ejecución (`InstanceRunningError`) o si el mundo es compartido y está en uso por cualquier otra instancia activa (`SharedWorldRunningError`).
  - `#backupRegionFiles`: antes de cualquier eliminación o sobreescritura de chunks, crea una copia de seguridad timestamped de los archivos de región afectados en `.backups/world-chunks-<uuid>/<saveName>/<dimension>/r.<rx>.<rz>.mca`.
- **Integración de interfaz**: `InstanceWorlds` expone botones de acceso directo "Progreso" (`world-action-progress`) y "Mapa" (`world-action-map`) en cada tarjeta de mundo, y barra de pestañas interna en la ficha de detalles (`world-tab-info`, `world-tab-progress`, `world-tab-map`).

## Validación

- **Suite unitaria de guardados y chunks**: **6 pruebas** dedicadas en `InstanceSavesService.chunks.test.ts` (verificación de guardados ausentes, rechazo en instancia en ejecución, rechazo en mundo compartido en ejecución, creación de respaldos automáticos y ejecución exitosa), **37 pruebas** en los 6 archivos de guardados (`snbt`, `progress`, `advancements`, `chunks`, `files`, `region`), y suite general del monorepositorio en verde.
- `pnpm check` y `pnpm lint` aprobados en los 6 paquetes del monorepositorio con **0 errores y 0 avisos** en `xmcl-runtime`; `pnpm --dir e2e exec tsc --noEmit` conserva exactamente los **56 diagnósticos base**.
- **Pruebas E2E de React**: **19 escenarios** de mundos aprobados al 100% en 1,1 minutos:
  - `61-world-information.spec.ts` (3 pruebas)
  - `62-world-operations.spec.ts` (3 pruebas)
  - `64-world-import.spec.ts` (4 pruebas)
  - `65-world-metadata.spec.ts` (3 pruebas)
  - `66-world-datapacks.spec.ts` (3 pruebas)
  - `67-world-tools.spec.ts` (3 pruebas: visor de progreso, mapa interactivo con copia/eliminación/respaldo y accesibilidad/responsividad)
- **Accesibilidad Axe** (`67-world-tools.spec.ts`): evaluación WCAG 2.1 AA en matriz completa de temas (`dark`, `light`) y resoluciones de ventana (`1200`, `800`): **0 violaciones**.
- **Flujo de compatibilidad con Vue**: renderer por defecto conservado intacto en Vue.

## Siguiente paso

Continuar con los bloques pendientes de la etapa 5 (`Espacio de instancia`):
1. **Bloque D**: Resumen y Ajustes Base de Instancia (`K07`, `K12`, `K13`: `/instance` resumen, `/instance/base-setting` selector de versión de Java, asignación de memoria RAM, argumentos de JVM, resolución de pantalla y servidor de partida rápida con soporte de herencia y valor `null`).
2. **Bloque E**: Consola de instancia (`K21`: `/instance/console` streaming aislado de procesos).
