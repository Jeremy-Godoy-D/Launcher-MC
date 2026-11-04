# Etapa6 aceptada — catálogo e instalación de contenido

Se completa la etapa6. K08/K09/K10/K15/K16 pasan junto a K14 ya aceptado. La etapa7 queda activa; Vue sigue predeterminado y producción beta.2 permanece intacta. Microsoft continúa pospuesto y el objetivo sigue siendo publicar0.3.0-beta.1 después de7–9.

## Cambio final

Aplicación funcional `39700ac`, presentación final `e7e49c1` y candidata/workflow `78f8bcd`. Se conservan STAGE6-CATALOG-BROWSING, MODPACKS, CONTENT y WORLDS. Se añade la actualización de packs existentes desde el menú de Biblioteca o la ficha; solo ofrece instancias del mismo proyecto/proveedor y permite importar en una nueva como antes.

La actualización descarga/verifica el archivo y espera a openModpack.ready antes de leerlo. Reutiliza importedOptions/validateImportFiles, previewInstanceFiles, installInstanceFiles y la recuperación nativa. Importa únicamente runtime/versión/upstream; conserva identidad, nombre, Java, argumentos, comandos, memoria y preferencias locales. Nunca copia xmclCache completo ni llama importModpack antes de confirmar. La revisión muestra versiones concretas de Minecraft y loaders, archivos, operaciones y backups; la configuración se aplica tras comprobar que no quedan archivos pendientes.

Instancias cambiadas, juegos abiertos u otras instalaciones pendientes bloquean el flujo. Los planes parciales quedan conservados y se revisan antes de reanudar; no hay éxito optimista. Paquetes que intenten cambiar mundos, capturas, logs u otros datos personales se rechazan y ofrecen importar en una instancia nueva. No se actualizan mundos del jugador silenciosamente.

Las filas de versiones muestran contenido instalado/importado y otras versiones conocidas mediante los estados nativos compartidos; no convierten metadatos aún desconocidos en una afirmación de ausencia. Al cambiar destino se conserva en la ruta local y al volver desde un requisito se mantiene la misma instancia. La consulta remota sigue usando solamente parámetros públicos del catálogo.

Una dependencia de otra clase se presenta con una acción para revisarla e instalarla en su carpeta. Al volver se comprueban activación, identidad, versión exigida, compatibilidad e integridad contra el inventario/metadata nativos; no se ignora el requisito ni se vuelve a pedir instalarlo en un bucle. Los conflictos también consultan otros inventarios. Shader sin motor ofrece administrar los mods de esa instancia. No se añade una key al renderer ni se cambia el Worker.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Suite seleccionada del workflow, cuatro workers e independiente | **1472 pruebas/144 archivos/28,81s** sobre39700ac |
| Cambio final de etiqueta de runtime | 18 pruebas afectadas posteriores y check React; no se repite toda la suite por una etiqueta |
| pnpm check completo y pnpm lint | pasan,0errores; advertencias anteriores |
| E2E tsc | exactamente56 diagnósticos base normalizados, ninguno nuevo |
| React empaquetado39700ac | **35 escenarios distintos**: nueve96/97/98 en26,3s y26regresiones93/94/95 en1,1min; workers1/retries0 |
| Candidata78f8bcd tras detalle visual | dos actualizaciones MR/CF en6,8s, con versiones exactas de loaders y capturas |
| Axe de las ejecuciones registradas | 24informes,0violaciones/52incomplete; incluye cuatro repeticiones tras la etiqueta final, no son24pantallas distintas |
| Vue/DeskGap | evidencia funcional/build e974e30 conservada y hostVue restaurado/verificado por compile; sin cambios nativos o de esos consumidores en este bloque |

Los escenarios97 verifican la acción desde Biblioteca, proyecto/destino correctos, una sola superficie, preview antes de aplicar, runtime/upstream, datos/ajustes del usuario, backups de ediciones, rechazo de mundos y recuperación de transferencia interrumpida. Los dos98 instalan un requisito real MR/CF en resourcepacks, vuelven al proyecto original con el mismo destino y completan su instalación en mods sin bucle ni archivo en la carpeta equivocada. Los escenarios95/96 comprueban los indicadores de instalado/importado. Se conservan las regresiones de búsqueda, sanitización, filtros, rutas, red y packs nuevos.

Se revisaron las capturas compactas de actualización: acciones fuera del scroll, sin solapamientos y versiones exactas visibles. Un fallo real al volver de un diálogo redimensionado dejaba el foco fuera del área visible; focusResults conserva el foco y lo acerca al viewport con scroll nearest. La primera97 llamaba un getter inexistente de la fixture: usa getSharedInstancesState. No se cambiaron timeouts ni reintentos ni garantías para conseguir resultados verdes.

Comandos desde launcher: Vitest con la selección del workflow/--maxWorkers=4, check, lint, checks React/E2E y comparación; build:renderer + build Electron con LAUNCHER_RENDERER=react; Native93–98 en las dos selecciones indicadas y después solo97 MR/CF afectado por la etiqueta. gen:testids con LAUNCHER_RENDERER=react produce152IDs. Restaurar host con LAUNCHER_RENDERER=vue y compile, comparar HTML con el dist Vue previamente validado. No hubo fetch sustituido ni DevTools/CDP ni pruebas en el perfil habitual.

Identidades: stage6-pack-update-focus-react-identity.json y stage6-closure-react-identity.json. Manifest ignorado stage6-closure-manifest.json: **cc8edd5e8e54c6d5a618a4939e37571afe2478c1887414e14a65e69d92802233**,21fuentes/115artefactos. Identifica la suite anterior al detalle de runtime y su comprobación posterior. Documentos/harness posteriores están fuera para evitar circularidad.

CI41443432293/9a64eb6 y41446162692/66e8877 terminaron success en ambas matrices. El nuevo push incorpora97/98 y deberá comprobarse sin reiniciar esos runs. PR4 continúa en borrador.

## Continuidad y límites

Etapa7: ajustes globales, actualizador/notas y sus errores, tareas/notificaciones/ayuda local, migration.html y accesibilidad restante. Apariencia/preferencias, logger/onboarding y las áreas0–6 ya aceptadas se reutilizan. auxiliary.tsx aún muestra un placeholder de migración: reemplazarlo por el flujo nativo, sin mover el perfil habitual durante pruebas.

Etapa8: React predeterminado y retirada de Vue/extras del grafo distribuido, contratos/datos conservados. Etapa9: aceptación física pendiente de K03/K05/K06, nuevo presupuesto de rendimiento/seguridad, instalador/actualización Windows Actions desechable, assets/checksums y publicación. La aceptación de6 no certifica una partida real, instalador, cuota/secreto real del Worker ni auditoría manual AA/RTL completa. Los incomplete requieren revisión humana; no se publica todavía.
