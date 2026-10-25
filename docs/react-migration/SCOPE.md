# Alcance vigente — núcleo Minecraft Java

Decisión directa del usuario, 2026-10-23: «Solo el núcleo propuesto, sin extras».

Este documento corrige la conservación indiscriminada de funciones heredadas del plan inicial. Prevalece sobre cualquier mención anterior a migrar toda función accesible. La paridad se exige exclusivamente para las funciones conservadas que se enumeran aquí. Los cambios visuales y el sistema de medios del plan continúan vigentes.

## Conservar

- Minecraft Java: instalar, lanzar, reparar y observar procesos.
- Instancias: crear, importar, editar, duplicar, agrupar, ordenar, exportar y eliminar con confirmación.
- Versiones y loaders Java actualmente soportados; diagnósticos de Java y memoria.
- Mods, resource packs, shaders y mundos, incluyendo instalación, actualización y operaciones locales existentes.
- CurseForge y Modrinth para búsqueda, información y descarga de contenido público. CurseForge siempre mediante su proxy actual.
- Perfiles locales y conservación de cuentas existentes. Microsoft sigue pospuesto; no solicitar ni configurar credenciales.
- Ajustes funcionales de Java, RAM, argumentos, resolución, descargas, red, directorios y actualización.
- Consola integrada e independiente, tareas, progreso, errores recuperables y diagnósticos locales.
- Actualizador, EXE/ZIP, checksums y enlaces públicos correctos.
- Onboarding, teclado, accesibilidad, navegación, ayuda local y controles de ventana.
- El nuevo diseño React con barra lateral, temas fijos claro/oscuro/sistema y presentación automática: recursos propios de cada modpack desde sus metadatos; para Vanilla/fallback buscar imágenes/vídeos reales de Minecraft en internet con fuente/licencia documentadas.
- La posibilidad normal de entrar a servidores dentro de Minecraft Java; retirar P2P de XMCL no bloquea el multijugador propio de Minecraft.

## Retirar de la nueva aplicación

- Asistente/agente IA, proveedores/modelos/herramientas y UI de chat.
- Minecraft Bedrock y sus instaladores/controles específicos.
- Amigos, grupos, voz, invitaciones, compartir mediante P2P y multijugador propio de XMCL.
- Administración remota SSH y despliegue/administración de servidores.
- Crear/vincular/publicar proyectos o versiones en Modrinth, cuentas comunitarias y funciones de autor. Exportar un modpack local permanece.
- Navegador de launchers/aplicaciones y host de extensiones descargables.
- Mando y Big Picture, incluidos avisos y configuradores específicos.
- Blueprints, colecciones comunitarias y fuentes heredadas no incluidas en CurseForge/Modrinth públicos.
- Editor de temas, CSS personalizado, burbujas y personalización arbitraria de fondos antiguos.
- Reproductor de música ligado a los temas antiguos. Los vídeos nuevos no tienen audio.
- Telemetría hacia servicios heredados de XMCL. Mantener logs/diagnósticos locales sin secretos.

## Reglas de retirada

1. Primero identificar pantallas, menús, arranque de servicios, IPC, procesos, tareas, dependencias y pruebas que alcanzan cada función retirada.
2. No portar esas pantallas ni sus dependencias de presentación a React.
3. Desconectar los extras del arranque y del grafo distribuido cuando estén separados. No ocultar solo el botón mientras sigue arrancando la función o contactando sus servicios.
4. No borrar paquetes completos por nombre: conservar utilidades compartidas que realmente requieran instalación, archivos, cuentas o lanzamientos del núcleo.
5. Preservar archivos/datos antiguos para recuperación. No cargar CSS, ejecutar scripts ni iniciar conexiones de extras al encontrarlos en esos datos.
6. Los enlaces antiguos a extras retirados muestran un mensaje de función no disponible o redirigen de forma documentada a Biblioteca. No activar la función para conservar su ruta.
7. Mantener las obligaciones MIT, LICENSE y NOTICE de XMCL; eliminar funcionalidades no elimina la atribución legal.
8. Las ventanas React necesarias quedan reducidas a principal, logger y migración. La entrada browser antigua queda inventariada como retirada, no como pendiente de implementación.

## Corrección posterior de medios

El usuario pidió material de internet en lugar de crearlo y precisó: «si puedes buscar de minecraft vanilla, pero en internet no busquyes las de los modpacks por que esos si usa los mismos recursos que ellos tienen».

- Para modpacks usar directamente sus recursos oficiales (icono, portada, galería y medios autorizados disponibles) mediante sus metadatos CurseForge/Modrinth. No buscarlos manualmente en bancos de imágenes ni inventar recursos del pack.
- Para Vanilla, ausencia de instancias y fallback ambiental, buscar imágenes/vídeos reales de Minecraft Vanilla en internet. No generar nuevas ilustraciones IA.
- Si un pack no proporciona vídeo autorizado, mantener su portada/imagen propia sobre un ambiente Vanilla general identificado como tal, conforme a la elección anterior del usuario de vídeo ambiental + portada.
- La rotación sigue cambiando fondo y destacada con las pausas definidas. No sustituir todos los fondos de packs por Vanilla: esa fue una interpretación errónea de la IA que el usuario corrigió.
- Documentar autor, URL, permiso/licencia, modificaciones y hash antes de distribuir material. No asumir que estar publicado en internet permite redistribuirlo.
- Mantener los presupuestos y pausas del plan. Descargar/preparar recursos de distribución controlada, sin streaming de vídeos arbitrarios ni reproductores YouTube dentro del launcher.
- La imagen generada antes de esta corrección no se incorporó al workspace y no debe copiarse a la app.
- Preferencia posterior: los paisajes Vanilla pueden y preferiblemente deben verse con shaders para mejorar la presentación. Son imágenes/clips ya renderizados obtenidos de internet: no instalar shaders automáticamente en las instancias ni ejecutar un motor de shaders en el launcher.
- Revisión visual 2026-10-24: «me gusta pero creo que te olvidaste de el fondo y quiero que agregues glassmorphismo». Extender paisaje a toda la ventana y aplicar cristal a marco/paneles/tarjetas, conservando legibilidad, fallback opaco y rendimiento. No interpretar este comentario como aceptación final del prototipo anterior ni reactivar el editor de temas o burbujas.

## Evidencia de aceptación del recorte

- El menú, las rutas y los ajustes de React contienen solo funciones conservadas.
- La aplicación arranca con datos antiguos de extras sin habilitarlos ni borrarlos.
- La captura de red y el grafo de importaciones no muestran arranque de IA, P2P, SSH ni telemetría heredada.
- No hay procesos, listeners ni tareas de extras iniciados por el nuevo bootstrap.
- Los contratos y recorridos de las funciones conservadas continúan pasando.
- La matriz PARITY distingue `keep`, `remove` y `deferred`; una retirada autorizada no se contabiliza como función incompleta.

## Aclaración del usuario — Java automático (2026-10-25)

Si falta el Java que necesita una instancia o modpack, descargar y configurar automáticamente uno compatible al confirmar el lanzamiento. Resolver el requisito desde Minecraft y su loader; no forzar una sola versión de Java para todas las instancias ni sobrescribir el Java del sistema. Reutilizar el instalador nativo, su verificación de integridad y el directorio `jre` del launcher.

Ante un fallo, indicar el requisito conocido, permitir reintentar y ofrecer una página oficial para instalación manual y volver a detectar Java. La elección de un ejecutable instalado en otra carpeta forma parte del selector Java de los ajustes de instancia/globales conservados. No iniciar Minecraft con Java incompatible ni tratar un enlace o una prueba con fixtures como evidencia de una descarga real. Detalle y límites en `STAGE4-LAUNCH.md`.

## Identidad definitiva — Grimo Launcher (2026-10-25)

El usuario confirmó **Grimo Launcher** como nombre definitivo y proporcionó los logos y el icono de aplicación en su carpeta `Nueva carpeta`. Usar sus archivos originales, sin generar sustitutos. Aplicar nombre/iconos a la interfaz y al empaquetado; conservar la distribución, fondos y paleta aprobados. `launcher/branding` documenta los originales.

Corrección posterior del mismo día: «adapta el color del logo» y usar las distintas versiones según su finalidad. Esta instrucción autoriza derivados de color de sus logos en cobre/crema/obsidiana, conservando los originales; prevalece sobre la prohibición anterior de generar sustitutos para ese ajuste. No autoriza imágenes IA para paisajes ni cambiar los recursos propios de los modpacks. Icono de app/ICO para Windows y controles pequeños; horizontal adaptado a cada tema para superficies amplias; principal e isotipo originales conservados para sus usos de marca.

Conservar los identificadores técnicos necesarios para abrir instalaciones anteriores: carpeta de datos y secretos `LauncherMC`, appId/AUMID `local.launchermc.desktop`, enlaces `launchermc` y repositorio de actualizaciones actual. El nombre visible y los nuevos paquetes pueden usar Grimo; los enlaces y binarios históricos conservan sus nombres. No interpretar el cambio de marca como autorización para borrar/mover datos, renombrar el repositorio remoto ni publicar una versión sin pasar sus gates.
