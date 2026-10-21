# Interfaz y flujos de SKlauncher 4.0.39

Análisis estático del 20 de octubre de 2026. No se ejecutó la interfaz. Se siguieron componentes compilados, condiciones de renderizado, handlers y llamadas al bridge `window.api`; las traducciones por sí solas no se usan para afirmar funciones.

## Artefacto y coordenadas

**R**: [index-C44oHH58.js](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/renderer/assets/index-C44oHH58.js>), SHA-256 `4e77beef2a754619563675bf6710b2ef072ba605d08ada5b340b07cdce06d115`. El hash se volvió a calcular y coincide con el miembro del ASAR registrado en [inventory.json](</C:/Users/jerez/Documents/ChatGPT/Launcher MC/analysis/inventory.json>).

**I**: [instances.svelte-CA2qEpy9.js](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/renderer/assets/instances.svelte-CA2qEpy9.js>), módulo importado por R para seguir las operaciones de instancias. También figura entre los miembros verificados del inventario.

`R:L119 @1002057` significa línea 119, offset absoluto base cero medido en puntos de código Unicode al leer UTF-8 con Python. No es offset de bytes ni índice UTF-16 de JavaScript/.NET; esos índices difieren unos caracteres. Los nombres como `V6r` pertenecen al bundle minificado y no se presentan como nombres originales del proyecto.

## Navegación y estructura

El shell ofrece cinco destinos principales: **Dashboard**, **Discover Content**, **Servers**, **Customization** y **Library**. `newInstance` es una acción que abre un modal; al entrar por el router, el root abre ese modal y vuelve a Library. Settings también usa un modal independiente (`Bl`); Friends usa un panel (`Fi`). No son páginas superiores equivalentes a las cinco anteriores. Evidencia: `K7`, R:L119 @1002057; root, R:L361 @1438977; `aAr`, R:L360 @1435584.

El router `Dfr` mantiene en memoria página, parámetros y una posición anterior/siguiente; no conserva una pila ilimitada de navegación. Los detalles reciben tipo, ID/slug, fuente e instancia opcional. Back vuelve a Library para instancias, Servers para servidores y Discover para contenido. El root conecta botones laterales del ratón y Alt+Izquierda/Derecha. Evidencia: R:L6 @529103 y R:L361 @1439750.

Hay composiciones **Classic** y **Modern** seleccionadas por `wt.isClassicMode`; cambian barras y ubicación de filtros, compartiendo los destinos y handlers. El renderizador `akr` conecta página con componentes concretos y distingue detalle de contenido, servidor e instancia. También existe una rama interna `contentbrowser`, sin entrada en `K7`. Evidencia: R:L119 @999211 y root R:L361 @1441600.

Antes del shell, el root puede renderizar recuperación/migración, bloqueo del actualizador, carga o login según estado. La presencia de una cuenta no basta: también se consideran inicialización, incorporación de cuenta y finalización de la transición de login. Evidencia: selección final R:L361 @1444840.

## Login y cuentas

`T5r` permite elegir Microsoft u offline; la opción offline depende de `ka.disableOfflineAccounts`. Los handlers delegan en `xt.loginMicrosoft()` y `xt.loginOffline(nombre.trim())`; el store llama a `window.api.auth.*`, muestra errores y contempla cancelación de Microsoft. Inicializa cuentas con `auth.initialize` y se suscribe a cambios. Evidencia: R:L142 @1059124 y R:L6 @446890.

El patrón local de nombre offline es `[A-Za-z0-9_]{3,16}`. Un nombre fuera del patrón abre **un aviso con confirmación**, cuyo handler vuelve a llamar a login; no es un rechazo definitivo del renderer. No se deduce de ello qué validaciones adicionales aplica el proceso principal. Evidencia: R:L142 @1059450 y @1067341.

El selector de cuenta muestra cuenta activa y otras guardadas; cambiar llama a `auth.switchAccount`, añadir activa `startAddingAccount` y salir llama a `auth.logout`. El root vuelve a login durante la incorporación aunque ya exista una cuenta. Evidencia: `bkr`, R:L119 @1004047; store R:L6 @447834.

## Library, creación e importación

Library filtra por nombre o versión y ordena por nombre, tiempo jugado o última sesión, además del orden preferente del store. Alterna lista/cuadrícula, puede ocultar instancias predeterminadas y abre detalle o menú contextual. El botón de jugar consulta actualizaciones de modpack antes de lanzar. Evidencia: `w7`, R:L51 @679576.

El modal `V6r` ofrece nombre, icono, versión Minecraft, inclusión de versiones no release/locales, loader y versión del loader. El nombre puede derivarse de la selección. La lista explícita aquí es **Vanilla, Fabric, Legacy Fabric, Babric, Forge, NeoForge y Quilt**; no se añaden otros loaders al modal por aparecer en traducciones o documentación posterior. Al abrir carga Vanilla, versiones locales y metadatos modded; ajusta compatibilidad y prefiere un loader recomendado. El botón crear requiere conexión, selección válida y ausencia de creación en curso. Evidencia: R:L271 @1313807; resolutor importado I:L1 @31086.

Crear ejecuta `nt.create({name, icon, versionEntry})`, que llega a `window.api.instances.create`. La opción de iniciar después espera la finalización de instalación si es necesaria. Al completar, root cierra el modal y muestra Library. Evidencia: R:L271 @1316611; I:L1 @28978; root R:L361 @1442940.

La biblioteca también abre importadores. El código conecta selección de ruta, listado de perfiles importables, ejecución y progreso con `instances.launcherImport`; hay fuentes Official, CurseForge, Modrinth y Prism, esta última marcada beta. La importación desde archivo usa preview y después `installation.importFromFile`/`importMmcPack`; OptiFine tiene otro flujo de preview/importación. Son caminos distintos de crear una instancia desde el selector. Evidencia: R:L266 @1266309 y @1267200; llamadas @1268672, @1269447, @1296690 y @1297469.

## Explorar e instalar contenido

`k7` conecta tipos **modpack, mod, resourcepack, shader, datapack y world**, fuente Modrinth/CurseForge y filtros de versión, loader/categoría. `Hl` implementa búsqueda con espera de 400 ms, orden por relevancia/descargas/actualización/novedad, lista/cuadrícula, estados de carga/error y paginación de 21 resultados. Conserva filtros y resultados del contexto para volver del detalle. Evidencia: R:L56 @708025 y @694200; store de búsqueda R:L6 @455307.

El detalle `O7` obtiene proyecto y versiones, con pestañas **Overview, Gallery y Versions**. Si no se fijó fuente, intenta Modrinth y CurseForge. Cuando existe instancia destino, usa su Minecraft/loader para escoger una versión compatible. Evidencia: R:L71 @826655.

Instalar un modpack asigna un ID nuevo; contenido individual usa una instancia contextual o abre un selector. Obtiene archivo principal/URL, conecta progreso de descargas y llama a `installation.start`; un modpack instalado vuelve a Library. El handler `Er.installMod` resuelve dependencias y abre un diálogo si hay dependencias requeridas, incompatibilidades o elementos irresolubles, antes de `content.mods.install`. Evidencia: tarjeta `P_`, R:L41 @601716; detalle R:L71 @828760; dependencias R:L6 @458637.

Dos límites visibles de esta versión: `Hl` vacía explícitamente resultados para **Worlds + Modrinth**; y el store reduce categorías al primer elemento antes de enviarlo a búsqueda, aunque algunos props sean arrays. No se afirma soporte efectivo de esos casos por la presencia de sus controles. Evidencia: R:L56 @694200 y R:L6 @455307.

## Detalle de instancia

`H7` busca la instancia por ID y presenta versión/loader, tiempo de juego y estados de instalación/ejecución. Sus acciones alcanzan jugar/parar, instalar/reparar, abrir consola, renombrar, cambiar icono, abrir carpeta y configuración, eliminar y crear acceso directo Windows. Un modpack vinculado con actualización disponible puede interponer un diálogo antes de lanzar y permite actualizar antes de jugar. Evidencia: R:L103 @965123.

| Pestaña | Conexión funcional observada |
|---|---|
| Content | Manifiesto, contenido instalado, instalación, actualización, activación/desactivación y eliminación mediante `content.*`; contempla vínculo y bloqueo de modpack. R:L6 @458637–465536. |
| Worlds | Lista por instancia y handlers de copiar, mover y eliminar mundos. `content.worlds.listForInstance/copy/move/delete`. R:L96 @937855. |
| Screenshots | Lista, copia, guardar como, revelar/eliminar y suscripción a capturas añadidas. `instances.listScreenshots/copyScreenshot/saveScreenshotAs/onScreenshotAdded`. R:L100 @952310. |
| Files | Lista de archivos, abrir/revelar, resolver ruta, renombrar, eliminar e importar archivos. `instances.listFiles/renameFile/deleteFile/importFiles`. R:L90 @916088. |
| Console | Oculta por defecto. Solo se incluye en las pestañas visibles cuando hay registro de la instancia en `runningInstances`; también existe apertura separada. R:L62 @796807 y R:L103 @965123. |

Orden, pestañas ocultas y pestaña inicial se guardan en `localStorage` bajo `starship-detail-tabs`. El editor impide ocultarlas todas y no permite Console como inicial. Estos son límites del renderer, sin ejecutar sus controles. Evidencia: R:L62 @796807–799000.

El diálogo de ajustes de instancia guarda con `nt.update`: nombre/icono, memoria, resolución/fullscreen, visibilidad del launcher, Java propio o componente administrado, JVM, entorno, Discord/GPU y comandos pre/wrapper/post cuando se habilitan. Incluye opciones de compatibilidad, DNS/LAN, permiso de cambios en mods de modpacks, reparación y cambio de versión con confirmación. Evidencia: R:L250 @1249535 y siguientes.

## Settings globales

El modal se divide en nueve secciones declaradas. Friends se oculta si la función está deshabilitada o la cuenta no es Microsoft. `developer` aparece en la declaración, pero se filtra siempre del menú y `X8r` no tiene una rama propia para esa sección. No se considera una pantalla accesible de esta build. Evidencia: R:L277 @1336513 y @1337777; selector R:L360 @1434047.

| Sección | Comportamiento seguido en código |
|---|---|
| General | Idioma; inicio automático/minimizado; bandeja; minimizar al jugar; aceleración gráfica; GPU; consola separada; Quick Play; sugerencias/mods inestables/fallback y clave CurseForge. Los handlers guardan mediante `settings.set` o stores. R:L351 @1387861. |
| Appearance | Tema claro/oscuro/OLED, tema de color/acento sólido o degradado y efectos visuales conectados al store de apariencia. R:L343 @1366242. |
| Friends | Lista/solicitudes y preferencias de participación/invitaciones conectadas al store y `friends.setAttributes`. R:L351 @1382908; store R:L6 @469937. |
| Java | Lista componentes/versiones/proveedores, verifica runtimes y permite instalar/eliminar con progreso. `java.getInstalled/getAvailable/verify/install/delete`. R:L351 @1401881. |
| Storage | Resumen y tamaños de instancias/compartidos, selección y borrado, limpieza compartida y solicitud de cambio de carpeta de datos. `storage.*`, `instances.delete`, `dataDir.change`. R:L357 @1413854. |
| Defaults | JVM, variables y comandos pre/wrapper/post globales; escribe `settings.defaultOptions`. R:L359 @1428041. |
| Privacy | Analítica, Discord RPC, activar Friends y escaneo manual; este último devuelve amenazas y número de mods retirados. `settings.set`, `ka.setFriendsList`, `co.scanNow`. R:L351 @1395487; R:L6 @468438. |
| Notifications | Cuatro toggles en variables locales de `g8r`. Este componente no conecta esos cambios a `settings.set` ni a un store persistente; su persistencia no está implementada en el fragmento revisado. No se generaliza a todo el sistema de notificaciones. R:L351 @1398814. |
| About | Versión/OS, actualizaciones, descarga/reinicio/manual y compartir log. Al montar llama a comprobar y, si queda `available`, a descargar/instalar. R:L341 @1345971. |

El botón Save del modal no constituye una transacción de todos los campos: varios handlers anteriores persisten inmediatamente. El root recibe el cierre/tema al guardar. Visitar About podría iniciar actividad del actualizador según su estado; no se visitó en ejecución. Evidencia: `aAr`, R:L360 @1435584; `MSr`, R:L341 @1345971.

## Skins y Friends

Customization usa ramas distintas por tipo de cuenta. Para Microsoft obtiene perfil/capas y biblioteca, permite seleccionar archivo o skin guardada, elegir Classic/Slim y capa, previsualiza y mantiene cambios pendientes hasta Apply. Apply llama a `skin.upload` y `equipCape/unequipCape`; puede restablecer la selección. El refresco manual tiene un mínimo de cinco segundos. Para offline muestra apariencia/capa recuperadas y acceso externo a SKmedix; no reutiliza la misma rama de subida Microsoft. Evidencia: `q7`, R:L59 @777940–783314; selección de rama R:L62 @793144.

Friends requiere cuenta Microsoft y feature flag habilitada. El store hidrata caché, recibe `friends.onUpdated`, consulta periódicamente y notifica si el panel está abierto; filtra bloqueados y distingue carga, éxito, deshabilitado, indisponibilidad temporal y problemas de conexión. Evidencia: R:L6 @473588–477726.

La UI muestra amigos/presencia y solicitudes entrantes/salientes; añadir envía nombre recortado, aceptar usa `ADD`, declinar/revocar/eliminar usan `REMOVE`. Hay confirmación para eliminar y preferencias separadas de participación/aceptación de invitaciones. El panel llama `gt.open/close` al montar/desmontar y también existe contenido Friends dentro de Settings. Evidencia: R:L141 @1029940; handlers R:L6 @477115 y R:L138 @1023205; añadir R:L178 @1154808; atributos R:L6 @469937.

## Límites de esta reconstrucción

Se identificó qué componentes se renderizan y qué handlers invocan servicios. Esto no verifica respuestas de backend, credenciales, servidores externos, descargas, integridad de mundos ni resultados al jugar. Los feature flags y datos remotos pueden ocultar elementos; contenido estático presente no garantiza acceso efectivo. Las coordenadas se vinculan al hash indicado y dejan de ser estables si cambia el bundle.

No se obtuvieron screenshots, accesibilidad ejecutada, tamaños reales de ventana ni una comprobación visual. No se crearon pantallas, implementación ni plan de proyecto. El riesgo principal de interpretación es confundir una ruta/handler disponible con comportamiento exitoso observado.
