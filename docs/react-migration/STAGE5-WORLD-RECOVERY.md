# Recuperación de mundos heredados desde React

Aplicación React probada: `42f65e5`; Vue y fixtures finales: `630add6`. La diferencia entre ambos commits contiene únicamente dos archivos E2E. K11 permanece pendiente; producción `v0.2.0-beta.2` intacta.

Mundos muestra cuándo hay datos heredados pendientes, explica que los originales se conservan y ofrece un reintento explícito. La consulta no reintenta ni escribe. El backend reutiliza la migración existente y agrupa peticiones simultáneas; conserva sesiones, colisiones, copias independientes, verificación y respaldos. Solo devuelve estado y cuatro motivos fijos, sin rutas ni errores crudos. Una partida abierta o una guarda de sesión no disponible impiden escribir. No se atribuye la falta de protección de sesión a una instalación Java ausente.

El recorrido real detectó una carrera compartida: el handler RPC guardaba un servicio en caché antes de terminar su inicialización y las llamadas siguientes omitían esperarla. Ahora también esperan la inicialización. Tres pruebas de RPC normal/trazado y fallo de arranque reproducen el fallo anterior y pasan con la corrección. No se serializaron artificialmente las consultas de React para ocultarlo.

## Evidencia

- **1.372 unitarias / 134 archivos**, suite final independiente, cuatro workers,32,11s. Focales iniciales73 y15 de inicialización/RPC; tres regresiones reproducidas con la línea correctora temporalmente retirada y restaurada en finally.
- Tipos Runtime/React/DeskGap aprobados en el desarrollo del bloque; Runtime comprobado nuevamente tras el cambio RPC. Lint final sin errores/un aviso previo. E2E tsc conserva56 diagnósticos base exactos, no está verde. Nueve pruebas del harness aprobadas.
- **23 escenarios React distintos** sobre el paquete42f65e5:22 del conjunto61/85/89/90/91 y el diálogo91 corregido; el conjunto final85/91 pasó12/12 con fixtures630add6. Se reutilizan los resultados válidos de las áreas sin cambios.
- **22 Vue y dos omisiones**, conjunto03/85/88/89/90/91, mismo código de aplicación. Ambas omisiones son interfaces exclusivas de React; las operaciones Native se probaron en los dos renderers. Un worker y cero reintentos.
- Recuperación Native y React sin reiniciar, con una clase Java externa reteniendo realmente session.lock, conservación antes de liberarla, copias con inodes diferentes, respaldo de originales y recarga final. No se ejecutó Minecraft.
- Cuatro Axe del aviso nuevo y ocho de regresión de información/borrado, todos sin violaciones; número exacto de incomplete en el manifest. Claro/oscuro y1200×720/800×400. Captura clara mínima revisada: aviso y acción alcanzables mediante scroll y foco visible. No se certifica AA manual global.
- El test no supondrá que volver a enfocar el mismo botón después de reducir la ventana provoca scroll: comprueba el desplazamiento real y conserva la verificación completa de clipping y foco. El foco vuelve al reintento bloqueado o al buscador tras recuperar.
- Vue restaurado como host, paquetes separados e identidades EXE/ASAR/HTML registradas. Tras una interrupción, el log de build DeskGap contiene las salidas generadas y no queda un proceso propio activo, pero no se recuperó su código de salida; no se repite únicamente para presentar un check verde ni se declara ese build confirmado. Compilación funcional/instalador/actualización permanecen pendientes en sus gates.

Comandos desde launcher: Vitest con el selector CI y `--maxWorkers=4 --reporter=dot`; checks Runtime/React/DeskGap;lint; E2E tsc y comparación normalizada. `LAUNCHER_RENDERER=react|vue pnpm build:renderer` antes del build Electron; Playwright sobre cada EXE con `XMCL_E2E_LOCALES=es-ES --workers=1 --retries=0 --max-failures=1 --reporter=line` y los conjuntos indicados. Native y builds secuenciales. Desde raíz: nueve pruebas/check del harness.

## CI y siguiente trabajo

CI41390951440/72bf920 terminó failure: Vue39pass/1skip/1fallo, React cancelado por matriz. La fixture Java80 sí pasó. El fallo85 fue WorldChangedError al iniciar watch: su helper publicaba la instancia antes de crear saves, mientras Vue puede observarla inmediatamente. Ahora prepara el mundo antes de publicar la instancia; conserva todas las aserciones de integridad y sesiones. Esta corrección de preparación y el cambio de inicialización deben confirmarse en el nuevo CI; no se declara demostrada su causalidad remota solo por pasar localmente.

Faltan la paridad React de compartir/activar mundos locales y la aceptación integral/noNIO/chunks de K11. K12/K21 pass, etapa5 activa y6–9 pendientes. No repetir lectores/escritores/consola aceptados sin regresión. Microsoft pospuesto; DOMPurify WIP y ANALISIS_ARQUITECTURA excluidos. La prioridad es terminar las funciones pendientes y publicar la migración completa tras los gates, reutilizando las evidencias vigentes.

Manifest: `launcher/e2e/artifacts/stage5-world-recovery-manifest.json`, SHA-256 `8b19fb24c362737bab6181c4591180d9cdf8a7af31f65568a10e88ffa765e3e3`; 12 fuentes y 221 artefactos. Axe:12 evaluaciones,0 violaciones/16 incomplete.
