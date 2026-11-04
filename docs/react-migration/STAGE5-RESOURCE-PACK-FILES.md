# Etapa 5 — archivos locales de resource packs

Fuente `f34855ed9d3ededa45cc785cf27343dc72b53417`. Etapa5/K09 pendientes. Este bloque añade importación local y retirada revisada; información/grupos/gestión de compartidos/updates y coordinación de arranque compartido no quedan cerrados.

## Comportamiento

Añadir archivos copia ZIP; Añadir carpeta copia packs desempaquetados con pack.mcmeta y sus assets. El origen permanece independiente: no se mueve ni se enlaza su inode. Se revisa el lote completo antes de copiar, se rechazan nombres/destinos en conflicto y se usan copias exclusivas. Acepta vacío y mismo destino como no-op para conservar callers Vue. Verifica SHA-256 del contenido copiado. Un fallo de I/O puede dejar copias parciales nuevas; la UI pide leer y revisar, sin reemplazar el contenido previo. La importación conserva la selección de Minecraft.

previewFolderFiles incorpora un modo interno resourcePack para conservar assets y archivos del pack; los callers de instancia/importación/exportación mantienen el filtrado anterior y no reciben ese modo desde RPC. La copia sigue el manifiesto de archivos y no materializa directorios vacíos del origen. Los límites son200 packs por operación,100000 entradas y64 niveles. Rechaza enlaces de origen y solo admite la carpeta compartida Native autorizada como destino.

La selección múltiple permite revisar nombres, cantidad/tamaño y efectos de carpetas/ajustes compartidos. La revisión Native es de solo lectura; SHA-256 vincula selección, opciones, ubicaciones/inodes y contenido de archivos/carpetas. Confirmar recalcula y rechaza una revisión obsoleta. Se desactivan únicamente las entradas retiradas en esos ajustes y se mueven los packs a .backups/resourcepacks-UUID; no se borran mundos, originales importados ni otros manifiestos. Las carpetas vacías existentes también se retiran conservándolas y se cuentan como0 archivos.

El movimiento utiliza fs-extra.move sin reemplazo, con fallback de copia para dispositivos distintos. Si el movimiento falla, pueden quedar packs desactivados o movidos parcialmente; el mensaje lo indica y ofrece abrir las copias. No hay rollback total. Archivos que el parser no reconoce también pueden seleccionarse y retirarse con revisión, conservando sus bytes.

Las operaciones nuevas comprueban Java registrado antes y después del lock, bloquean partidas registradas de la instancia y las que usan la carpeta o los ajustes compartidos afectados. Utilizan el mismo lock de opciones que la selección/prioridad. Importar archivos no bloquea una partida ajena por compartir solo opciones que esa importación no modifica.

## Validación

- 809 unitarias/85 archivos,17,37s, lista explícita del workflow;17 nuevas sobre792. Guardas Native, preflight del lote, independencia de fuentes/inodes, carpetas/assets, errores de revisión, backups, límites/enlaces, empty/same-path y carpeta vacía. Focal26/3 archivos además confirma el fallback real de fs-extra al inyectar EXDEV en rename; no es prueba de dos unidades físicas.
- Tipos raíz/lint aprobados; tipos runtime nuevamente tras usar el movimiento cross-device y lint al guardar. E2Etsc conserva56 diagnósticos previos,0en43–45/helper de contenido. Harness9 y check al guardar.
- Tanda final:6 React43/44,20,9s y4 Vue03/08/33/45,21,9s:10 escenarios distintos. ZIP/carpeta reales sintéticos mediante picker simulado; servicio, lectura, revisión, copia/movimiento y guardado Native reales.45 prueba compatibilidad Vue de instalación vacía/mismo destino y escritura legacy/lectura nueva de selección.
- Comprueba copia independiente de archivo/carpeta y assets, cancelación sin escritura, rechazo de colisión/revisión obsoleta, opciones ajenas/CRLF y mundo sintético/otro manifiesto preservados. La recuperación de ZIP inválido conserva sus bytes en backup. No partida Minecraft ni instalación Java.
- 8 auditorías Axe vigentes, cero violaciones/12 incomplete y12PNG. Claro/oscuro1200×720 y800×400; título, cuerpo con scroll, pie y todas las acciones locales accesibles por foco. Revisión visual de diálogo, acciones y resultado. No AA manual exhaustiva. Las primeras dos pruebas fallaron por selector ambiguo de Cancelar (icono y pie); se acotó al pie y no se retiró ninguna aserción.
- Ambos renderers/hosts reconstruidos y dist/default Vue conservados; el último ajuste posterior a pruebas fue solo el comentario del criterio K09. CI40777460071 pasó ambos para6dd22ea/d63be84. Este source necesita CI propio tras push. No incrementa versión ni publica.

Comandos desde launcher: lista vitest del workflow; pnpm check/lint, checks runtime focales; pnpm --dir e2e exec tsc --noEmit; build:renderer y host build por LAUNCHER_RENDERER; Playwright43/44 React y03/08/33/45 Vue con EXE propio y es-ES. Desde raíz status/check y node --test launcher/scripts/react-migration.test.mjs.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-pack-files-artifact-manifest.json`, SHA-256 `2f9391c145783638dcf362b57971a1df93d7ed123e4ad0063389157443526935`:16 fuentes Git canónicas, logs fallidos/aprobados, artefactos y hashes EXE/asar de ambos outputs mutables.

## Siguiente acción y límites

Antes de cerrar K09, coordinar la mutación compartida con el arranque de otra instancia vinculada. getGameProcesses refleja procesos registrados; LaunchService registra el proceso después de spawn. Las guardas actuales no acreditan exclusión frente a un arranque concurrente; queda un shortcut explícito y este criterio pendiente. Añadir prueba de esa carrera y resolverla antes de publicar. Después información/grupos/compartidos/updates de packs, shaders, mundos, ajustes, consola y6–9.

No reimplementar copia/retirada ni volver al install/uninstall legacy sin estas guardas. No certifica toda la API histórica de recursos/ajustes, escrituras externas concurrentes, rollback total/corte eléctrico, Java/juego/NSIS/delta reales ni presupuestos finales. K08/K09 y gates5 pendientes. Producción/proxy intactos, Microsoft pospuesto, Vue predeterminado, PR4 borrador. No DevTools/CDP, no tocar ANALISIS_ARQUITECTURA.md ni reintentar limpiezas denegadas.
