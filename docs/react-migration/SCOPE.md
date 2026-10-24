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
- El nuevo diseño React con barra lateral, temas fijos claro/oscuro/sistema y presentación automática mediante imágenes/vídeos.
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

## Evidencia de aceptación del recorte

- El menú, las rutas y los ajustes de React contienen solo funciones conservadas.
- La aplicación arranca con datos antiguos de extras sin habilitarlos ni borrarlos.
- La captura de red y el grafo de importaciones no muestran arranque de IA, P2P, SSH ni telemetría heredada.
- No hay procesos, listeners ni tareas de extras iniciados por el nuevo bootstrap.
- Los contratos y recorridos de las funciones conservadas continúan pasando.
- La matriz PARITY distingue `keep`, `remove` y `deferred`; una retirada autorizada no se contabiliza como función incompleta.
