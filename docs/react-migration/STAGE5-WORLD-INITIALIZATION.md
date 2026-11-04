# Etapa 5 — conservación durante la inicialización de Mundos

K11 sigue pendiente. Aplicación y ejecutables finales: `6b50d6b2b28ec752cb7998ceade75b3bad6daf55`. Implementación inicial y regresión amplia: `43c0bf8d83de469fa0d1e244ffc97bb825b60095`. Fixtures finales de lanzamiento: `3bd038011160a4cb37b01b421dd8f39dbacf03d0`; se comprobó que después del build solo cambiaron dos archivos de pruebas, no la aplicación.

## Comportamiento

- Se elimina la limpieza por atime de snapshots de `saves`. El arranque no borra archivos antiguos por su fecha de acceso ni necesita inicializar ResourceManager para decidirlo. Se retiró esa dependencia del constructor y se actualizaron sus tres consumidores manuales de pruebas.
- Antes de crear carpetas se valida la raíz configurada y el depósito canónico. Un enlace en la raíz o en las carpetas protegidas se rechaza antes de escribir en su destino. El alias de un directorio padre autorizado continúa funcionando.
- La migración de `shared-saves` usa los locks global/del depósito, comprueba que no haya partidas y obtiene las guardas de sesión de los mundos. Reutiliza snapshots SHA-256 y copia exclusiva; no sigue enlaces. Se excluyen los controles `session.lock` de las copias, mientras los originales permanecen en el respaldo.
- Los nombres ocupados se conservan; se elige un nombre disponible. Las copias ya completas e idénticas se reutilizan al reiniciar después de un fallo. Una copia parcial no se sobreescribe ni se confunde con un mundo completo. Se comprueban contenido e identidad antes de apartar los originales.
- Tras verificar las copias, se conserva la carpeta original completa en `.backups/legacy-worlds-*/shared-saves`, incluidas notas, archivos y carpetas ocultas. Se liberan los handles inmediatamente antes del rename de Windows. Ante un fallo se conservan originales, copias completas y posibles destinos parciales, sin limpieza destructiva para simular rollback.
- El snapshot compartido admite una lista concreta de controles omitidos y su función de copia se reutiliza en lugar de duplicarla. Sus consumidores de packs y shaders mantienen el comportamiento anterior.

La operación necesita espacio para copias independientes y hace E/S proporcional a los datos heredados; solo se ejecuta cuando existe `shared-saves`. Un arranque normal sin esa carpeta no copia mundos. Límites: 1.000 entradas superiores, 100.000 entradas de snapshot y 1.000 alternativas por nombre; límites de profundidad/identidades del helper existente. No se habilitan P2P, hosting ni extras retirados.

## Validación y alcance de cada ejecutable

- **1.351 unitarias / 131 archivos**, 66,28 s, cuatro workers y ejecución independiente, después de añadir la comprobación de raíz. El primer conjunto fue de 126 focales; la ejecución completa final incluye el caso nuevo. Tipos Runtime/DeskGap aprobados, lint sin errores/un aviso previo y build DeskGap de producción aprobado. No se hizo un recorrido funcional propio de DeskGap.
- Aplicación 43c0bf8: React **26 escenarios distintos** (tres de89 y23 de48/57/66/85/88); Vue **19** (03/58/63/85/88/89). Incluyen arranque real con datos heredados, nombres ocupados, archivos antiguos, backups con inodes distintos, enlaces ajenos, sesiones Java NIO externas, packs/shaders y observadores.
- Aplicación final 6b50d6b: **seis React y seis Vue**, specs88/89, tras recompilar ambos. Confirman lectores, alias, recuperación y arranque con las validaciones finales. La diferencia de aplicación respecto de43c0bf8 es validar la raíz antes de crear `saves`; el otro cambio es su prueba unitaria.
- La regresión de lanzamiento final añadió **cuatro React**, spec12, con fixture 3bd0380. Un worker y cero reintentos en todas las ejecuciones. No se ejecutó Minecraft; Java externo solo se usó como dueño de una sesión de prueba.
- E2E tsc: exactamente **56 diagnósticos base**, sin añadidos ni retirados; no se afirma tsc verde. Nueve pruebas del harness aprobadas y check posterior al registro de evidencia.
- Regresión visual del paquete43c0bf8: **21 Axe, cero violaciones y 46 incomplete** en packs/shaders/datapacks, claro/oscuro y 1200×720/800×400. Inspección manual de compartir shaders en claro mínimo: contenido desplazable y acciones visibles. No hubo UI nueva ni se certifica AA manual global. Buffer/GPU al cerrar y errores esperados de pruebas negativas quedan registrados.
- Native y builds secuenciales. El HTML final del host conserva el hash del Vue probado; ambos paquetes permanecen separados. DOMPurify WIP y `ANALISIS_ARQUITECTURA.md` no se tocaron ni se incluyeron en los commits.

Comandos desde `launcher`: Vitest con los selectores de `.github/workflows/react-migration.yml` y `--maxWorkers=4 --reporter=dot`; checks Runtime/DeskGap; `pnpm lint`; E2E `tsc --noEmit` con comparación normalizada; builds Electron con `LAUNCHER_RENDERER=react|vue`; Playwright con el EXE correspondiente, `XMCL_E2E_LOCALES=es-ES`, los specs indicados y `--workers=1 --retries=0 --max-failures=1 --reporter=line`; build DeskGap con `NODE_ENV=production` y renderer Vue. Desde raíz: pruebas/check del harness.

Manifest ignorado: `launcher/e2e/artifacts/stage5-world-initialization-manifest.json`, SHA-256 `2ca48be2db472330d27e14ae22a6aea64f0df12886c347a9fd8a0880cfc2e0bc`. Registra **11 fuentes y195 artefactos**, con identidades de EXE/ASAR, logs, trazas y capturas. Excluye perfiles/cachés, reparse points, el resto del archivo descargado de CI y operaciones posteriores de PR/check. Conserva específicamente la traza y contexto del fallo de CI analizado.

## CI y corrección de la prueba de lanzamiento

CI41355748466/28039b0 terminó **success**. CI41357342729/78903b4 terminó **failure**: Vue pasó 1.343 unitarias y 33 Native; React pasó 252, omitió 2 y falló 1, spec12 después de recargar el renderer.

La prueba confundía `minecraft-start` con la confirmación terminada. La fixture espera un registro de historial antes de completar su lista sintética de procesos; con E/S lenta, el nuevo renderer consultaba esa lista todavía vacía. En la implementación real, el proceso se registra antes de emitir el evento. Retrasar la respuesta después de registrar el proceso pasó como control; retrasar el registro sintético 1 s reprodujo exactamente el fallo de CI en la misma aserción.

La prueba conserva ese retraso deliberado y espera que el control Cerrar esté habilitado antes de Escape; además exige que el diálogo haya desaparecido antes de recargar. La suite 12 pasó 4/4 con las mismas aserciones de lanzamiento único, restauración, pausa y parada, sin cambiar timeouts ni reglas del producto. El CI del nuevo SHA debe verificarse después del push; no se usa un reintento como aceptación.

## Trabajo pendiente

Faltan `InstanceService.moveSavesToShared/deleteInstance` (raíces, colisiones, sesiones y conservación ante fallos), el aviso/reintento visible de una migración heredada bloqueada y la aceptación integral/noNIO de K11. Actualmente los fallos de inicialización se registran y dejan los originales en su lugar; este bloque no acredita su recuperación completa desde la UI.

K12/K21 pass; etapa 5 activa; 6–9 pendientes. Todas las herramientas locales y chunks conservados. Microsoft pospuesto; producción beta.2 y proxy intactos, PR4 borrador. Juego real, rendimiento final, seguridad/accesibilidad integral e instalador/actualización aislados siguen pendientes antes de publicar v0.3.0-beta.1.
