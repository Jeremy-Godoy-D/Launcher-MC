# Etapa 7 — actividad, caché, cierre y transferencia del actualizador

Aplicación `cb5e55c`, correcciones `ff3856b`/`fdf940e` y candidata `a65cab0`. K20 pasa; la etapa 7 sigue activa y sus tres gates permanecen pendientes. Directorios y `migration.html` aún necesitan implementación/validación.

## Resultado

Tareas y Notificaciones de la barra superior usan el `TaskStore` existente: un monitor compartido, progreso, cancelación, resultados de sesión y limpieza de tareas terminadas. Se muestran nombres de instancias conocidas y etiquetas humanas; no se exponen URLs, claves internas ni errores completos. El panel conserva teclado/foco y permite seguir navegando al cerrarlo.

Apariencia añade limpieza del caché desechable de imágenes mediante `PresentationService.clearCache`, conservando archivos ajenos y datos de juego. Se corrigió el padding/borde duplicado del buscador. El cierre nativo con ajustes pendientes ofrece seguir aquí, guardar o descartar; un guardado fallido mantiene el diálogo y el borrador.

La prueba real del actualizador encontró y corrigió dos fallos: la primera descarga trataba como texto un checksum de caché inexistente; una cancelación desde otro componente podía interpretarse como error antes de actualizar el estado React. Se reutiliza `verifyUpdate` para comprobar la caché y se consulta el snapshot autoritativo del monitor después de cancelar. Un fallo HTTP/de red al consultar Releases ahora muestra error, en vez de afirmar que no existen actualizaciones.

El servidor HTTP propio entrega metadatos y bytes sintéticos: 503 → consulta válida → transferencia retenida → cancelar desde Tareas → rechazar bytes con SHA incorrecto → limpiar notificaciones → reintentar y verificar archivo/sidecar. Las redirecciones `webRequest` solo afectan solicitudes del proceso principal. Se usa un token ficticio en ese proceso aislado; no se sustituyen funciones `fetch`. La prueba ejercita la rama interna autenticada y comprueba que los enlaces visibles siguen siendo públicos.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Selección completa del workflow, cuatro workers | **1.505 pruebas / 149 archivos / 33,19 s** |
| Pruebas afectadas | 44 aprobadas; 6 posteriores de caché/SHA/etiquetas, 9 de tareas y 5 de inventario |
| Tipos/lint | Check completo inicial; Electron main/preload y React posteriores aprobados; lint 0 errores |
| Tipos E2E | 56 diagnósticos base normalizados, sin cambios |
| Native nuevo | **3 casos / 7,4 s** sobre `fdf940e`: transferencia, caché y cierre |
| Regresión de mods | **9 casos / 34,1 s** sobre `a65cab0`, información/diagnósticos/cambios revisados |
| Vue | **2 casos / 10,0 s**, host y onboarding |
| Axe nuevo de actividad | **2 informes: 0 violaciones y 4 comprobaciones incompletas**; capturas en 1200×720 y 800×400 |
| DeskGap | Build React con `NODE_ENV=production` aprobado; sin recorrido nativo DeskGap |
| Anclas | 186 |

Comandos desde `launcher`: selección Vitest de `.github/workflows/react-migration.yml`/`--maxWorkers=4`; tipos/lint/E2E y comparación normalizada; `gen:testids` con React; build renderer + Electron; Playwright `100-global-updater` y `101-settings-cache-close`; regresión `35-mod-information`/`36-mod-diagnostics`/`37-mod-changes`; Vue `03-vue-compatibility`/`08-vue-onboarding`. Native secuencial, workers1/retries0/max-failures1. Las pruebas no aplican el ASAR ni ejecutan instaladores. El host queda restaurado a Vue con HTML verificado; React sigue independiente y opt-in hasta 8.

La CI de `5b05060`, run41465603945, pasó Vue. React terminó con304 aprobadas/2 omitidas/1 fallo en35: al desactivar tras releer, la protección detectó metadatos aún incoherentes y conservó el archivo. Se leyó únicamente su contexto de error mediante rangos del artefacto. `refreshFiles` ahora espera la publicación de los archivos válidos ya conocidos, usando el helper existente; los archivos malformados siguen disponibles para diagnóstico. Se conserva la comparación de hash/configuración y se añadió una aserción del SHA actual. El caso aislado y las nueve regresiones posteriores pasan; no se reinició aquella CI. El próximo push debe verificar esta corrección en CI.

Manifiesto ignorado `stage7-actions-manifest.json`: **72debd2e0794aa239cf2bb10979f58553dc4b125335dc6b1154a9b9e7e89a8c4**, 21 fuentes y 27 artefactos. Identidades: `stage7-actions-cancel-react-identity.json`, `stage7-actions-mod-refresh-react-identity.json` y `stage7-actions-vue-identity.json`. Logs/capturas permanecen ignorados.

## Pendientes

Completar migración segura de carpetas, ventana de progreso/error/final y selección conservada; después revisar arrastre/AA/RTL y cerrar 7. La transferencia pública sin token y la actualización/instalación completas se comprobarán en9, junto a juego/Java/loaders físicos, rendimiento y seguridad. Los bytes sintéticos de100 prueban descarga e integridad, no un paquete ejecutable actualizado. Los `incomplete` de Axe requieren revisión. No se publica todavía: producción beta.2 y proxy permanecen intactos, Microsoft pospuesto.
