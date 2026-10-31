# Etapa 5 parcial — actualizaciones de mods en React

Fuente `98c76040db74677097800393f602bcd38b76a6cc`. Etapa 5 y K08 siguen pendientes: este bloque conecta actualizaciones de mods; no completa packs/shaders, mundos, ajustes o consola. Producción v0.2.0-beta.2 y proxy sin cambios; objetivo v0.3.0-beta.1, PR4 en borrador.

## Comportamiento

Desde Mods, Buscar actualizaciones abre selección de fuente, canal estable y filtro para omitir archivos de otro Minecraft. Conserva las claves legacy de preferencias por instancia, incluye mods desactivados y no instala al abrir/renderizar. La consulta explícita refresca identidades públicas y usa las clases instaladas de Modrinth/CurseForge. No copia clientes de autor/FTB ni claves. La instancia debe tener Minecraft y un único loader identificado; Quilt/NeoForge mantienen sus identidades.

TanStack Query5.105.0 cachea solo metadatos públicos dos minutos, libera después de cinco y permite dos reintentos transitorios; sin retry de autenticación/validación/429. Retry-After impide otra solicitud renderer durante su plazo. Modrinth usa lotes por hashes y su filtro version_types opcional, añadido con compatibilidad del cuerpo antiguo. CurseForge consulta secuencialmente, pagina50 y limita cada historial a500; marca un historial truncado como incompleto. Comprueba proyecto, hash actual, canal, Minecraft/loader y fecha; no propone un downgrade. Resultados disponibles sobreviven a fallos de la otra fuente; archivos sin identificación y datos incompletos se indican.

Antes de confirmar, Native calcula los cambios reales. React envía fingerprint y operaciones exactas a las guardas ya registradas en REVIEWED-UPGRADES. Conserva .disabled, revisa nombres/retiradas y deja cancelar antes de instalar. Las tareas muestran progreso y permiten detener la operación; errores conservan selección, archivos y planes pendientes. No añade dependencias automáticamente ni garantiza compatibilidad dentro del juego.

getReviewedModInstalls devuelve solo operaciones revisadas activas y sus archivos, sin perfiles/workspace privados. Reanudar con el tercer parámetro reviewedOperationId aplica únicamente esa operación, sin overrides. La reanudación general rechaza overrides de cualquier plan revisado antes de iniciar otro trabajo de la cola; cada perfil vuelve a comprobarlo. Una revisión obsoleta requiere nueva consulta/revisión o recuperar sus condiciones; no se aplica silenciosamente.

## Carrera corregida con prueba real

La primera prueba con CurseForge no encontró candidatos aunque main había guardado sus IDs. Los eventos de ResourceState se agrupan durante500ms; await refreshMetadata/revalidate no acredita que el renderer ya los recibió. getModSources lee de la caché persistida para los hashes del directorio ya observado, solo para Java registrado, máximo10000 entradas y solo IDs públicos. No crea un watcher/carpeta, no cambia contratos de batching ni introduce una espera arbitraria. ResourceManager conserva el tipo real de su watcher y su posible ausencia. Pruebas comparan estado sin IDs con metadatos ya guardados y excluyen campos ajenos.

## Validación

- 747 unitarias/80 archivos,23,34s, lista explícita del workflow. Tipos raíz y lint aprobados. Después del último ajuste de distribución: tipos/lint React y cuatro recorridos empaquetados adicionales. E2E tsc mantiene56 diagnósticos previos, cero en39/40/41; no se afirma que todo E2E compile.
- 34 recorridos React de14/24/31/37/38/39/40,1,5min; cuatro de40 repetidos tras compactar la revisión,13,2s. Tres Vue03/08/33,23,8s. Los cuatro repetidos no aumentan el total de escenarios.
- Dos pruebas LIVE por opt-in,14,5s, con APIs/descargas reales y sin sustituir instalador/servicios/fetch. Mod Menu11.0.4 (`v6Xx3fbU`; CF7808443) pasó a11.0.5 (`6lgOkclV`; CF8966434) con ambas políticas de proveedor. Se verificó SHA-512 de los JAR mediante la respuesta pública, SHA-1 instalado2321d890a25b5985eba576d7cd8fe9a9c136e33d,975846bytes, .disabled conservado, sin operación revisada pendiente y el archivo sintético saves/keep/level.dat intacto. No se inició Minecraft.
- Total actual39 escenarios distintos empaquetados (34React+2LIVE+3Vue).39 comprueba reanudación Native tras recargar y conservación de otro plan; el servicio/FS son reales.40 usa metadatos y respuesta de aplicación sintéticos para probar UI, pero inventario/vista previa Native reales.41 acredita la aplicación real con proveedores.
- Auditorías vigentes por área: 26, cero violaciones/52 incomplete. Se excluyó el40 anterior al ajuste de distribución al sumar Axe. Hay51PNG retenidos contando ambas revisiones, no51estados distintos. Revisión visual en1200×720 y800×400, claro/oscuro; en mínimo se ven ambas filas de la confirmación y sus acciones. No auditoría manual AA exhaustiva.
- Harness9pruebas y check aprobados. Ambos renderers/hosts reconstruidos; tras el último UI se reconstruyó React y se restauró dist con compile Vue. Default sigue Vue. CI40732582108 aprobó ambos sobre9b0c117/5bddad9; esta fuente requiere CI propio tras push.

Comandos desde launcher: workflow vitest explícito; pnpm check/lint; pnpm --dir e2e exec tsc --noEmit; build:renderer y build de host con LAUNCHER_RENDERER; Playwright con EXE propio, locales es-ES y specs citados. LIVE solo con XMCL_REACT_LIVE_PROVIDERS=1; no forma parte de CI determinista. Restore: LAUNCHER_RENDERER=vue pnpm --prefix=xmcl-electron-app compile. Desde raíz status/check y node --test launcher/scripts/react-migration.test.mjs.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-mod-updates-artifact-manifest.json`, SHA-256 `905bff6fb71b7e1561d43e453ae6a28b0f6937ec6352db0deaa3a722cc51975d`: 22 fuentes Git canónicas, logs incluidos los fallidos, artefactos y hashes de cuatro paquetes al capturarlos. Los paquetes son outputs mutables. Se retuvo la carrera real inicial y el fallo del preflight de overrides en una cola mixta; las pruebas ahora comprueban la corrección sin quitar aserciones. La primera fixture de UI también se corrigió para decorar los eventos sintéticos tardíos, no solo la primera respuesta.

## Continuación y límites

Completar recuperación/revisión de planes tras cambios de archivos/configuración y su UX de reintento/cancelación, incluidos cambios rápidos de instancia. Después packs/shaders, mundos, ajustes, consola y6–9. No cerrar K08 ni gates5 por estas pruebas. El catálogo React completo aún no existe; no confundir estas consultas de updates con etapa6.

La metadata Native de identificación conserva el refresh heredado y sus solicitudes a ambos proveedores; la política elegida controla la búsqueda de versiones. La cancelación de una consulta no aborta una lectura Native ya iniciada. Las fuentes no identificadas se declaran sin comprobar, no se certifican actualizadas. El límite de historial CF es visible; no garantiza hallar toda versión histórica. No se certifican dependencias universales, transacciones FS, rollback total/cortes eléctricos, Java/juego/NSIS/delta ni presupuestos finales. Microsoft pospuesto; ningún secreto en renderer/documentos.

Referencias oficiales: [Modrinth hashes/version_types](https://docs.modrinth.com/api/operations/getlatestversionsfromhashes/), [CurseForge REST](https://docs.curseforge.com/rest-api/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/query-options). No tocar ANALISIS_ARQUITECTURA.md ni reintentar limpiezas denegadas launcher-update-6nFkM2 y .progressive-install-test-s7GPKa.
