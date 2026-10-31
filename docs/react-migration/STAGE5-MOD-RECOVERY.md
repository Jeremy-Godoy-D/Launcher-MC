# Etapa 5 — recuperación revisada de mods

Fuente `dbc447399769b4b868a7579785246f3772914818`. Etapa5 activa; K08 y sus gates siguen pendientes.

## Comportamiento

React permite revisar de nuevo una operación interrumpida sin perder su progreso. Native calcula las operaciones actuales, detecta cambios de configuración y devuelve una revisión de solo lectura. La confirmación vuelve a comprobar plan, configuración y bytes bajo el bloqueo existente; no acepta una revisión obsoleta ni overrides de artefactos confirmados. El token SHA-256 vincula el estado, no es autenticación ni firma. Cada recuperación identifica una sola operación y permite cancelarla sin aplicar otras colas.

Los archivos editados se conservan en copias antes de sustituirlos. Se corrigió computeFileUpdates para comparar también el nombre anterior cuando el cambio solo afecta mayúsculas: en Windows un archivo editado requiere backup-add antes de sustituir su alias. Los nombres sin cambios conservan su comportamiento. No se modifica el mundo ni otro manifiesto pendiente.

La UI prioriza operaciones pendientes sobre filtros, conserva acciones fuera del scroll y advierte cuando los artefactos se eligieron para otra configuración. Esa advertencia requiere confirmación explícita; no garantiza compatibilidad del juego. Cancelación/reintento y respuestas tardías A→B quedan cubiertos.

## Evidencia

- 770 unitarias/81 archivos,18,96s. Incluye7 casos Native nuevos y el caso nuevo de mayúsculas;15 pruebas existentes de files_delta se agregaron a la lista CI. Reproductores rojo→verde conservados. Tipos y lint raíz aprobados; tipos/lint React después del ajuste visual.
- 12 recorridos React39/40/42,38,8s y3 Vue03/08/33,20,3s:15 escenarios distintos. El42 se repitió después de compactar la distribución (13,6s) y para medir título/scroll (13,7s); no se suman como escenarios nuevos. Native real, tareas/cancelación, archivos y servicios;40 sustituye respuestas de proveedores/aplicación para los escenarios de UI.
- 42 comprueba edición después de la vista previa, rechazo obsoleto, recarga, recuperación con backups exactos y conservación byte a byte de otro manifiesto y un archivo sintético de mundo. Metadatos/JAR sintéticos; no juego.
- Auditorías vigentes40+42: 12, 0 violaciones/24 incomplete. Capturas claro/oscuro1200×720 y800×400 revisadas. Medidas antes/después de Axe confirman título completo y scrollTop exterior0; scroll queda en el cuerpo. Ambas acciones pendientes y el pie están visibles en mínimo. Sin auditoría manual AA exhaustiva.
- E2E tsc global conserva56 diagnósticos previos,0 en39/40/42. Harness9 pruebas y check. Ambos paquetes reconstruidos; dist compartido restaurado a Vue. CI40766330281 pasó ambos renderers sobre00e06e8/98c7604; esta fuente necesita su propio CI tras push.

Comandos desde launcher: vitest con lista explícita del workflow; pnpm check/lint; pnpm --dir e2e exec tsc --noEmit; build:renderer y build de host con LAUNCHER_RENDERER; Playwright con ejecutable propio y es-ES para los specs citados. Desde raíz node launcher/scripts/react-migration.mjs check y node --test launcher/scripts/react-migration.test.mjs. Logs y capturas ignorados.

Manifiesto `launcher/e2e/artifacts/stage5-mod-recovery-artifact-manifest.json`, SHA-256 `2f9be5cc3de36e25c620a229fb2ae95ed43c375104dbe52686e420c08a779c7e`. Incluye fuentes Git canónicas, logs fallidos y aprobados, capturas/medidas y hashes EXE/asar de ambos outputs mutables al capturarlos.

## Continuación y límites

Implementar packs/shaders, luego mundos/ajustes/consola y etapas6–9. No repetir por rutina el bloque de mods; su cierre total exige la comprobación de paridad posterior. LIVE de proveedores acreditado en MOD-UPDATES, no repetido aquí. No certifica dependencias universales, rollback total, cortes eléctricos, partida/Java real, NSIS/delta, AAmanual ni presupuestos finales. Producción y proxy intactos, Microsoft pospuesto, Vue predeterminado y PR4 borrador. No DevTools/CDP, no tocar ANALISIS_ARQUITECTURA.md ni reintentar limpiezas denegadas.
