# Etapa 5 — autoridad de archivos, recuperación de iconos y evidencias

Aplicación: `a5f3ed7`; verificación/harness: `5614fcd`, sin cambios de aplicación posteriores al primer commit. Fuente base completa: `5c79ece`. Manifiesto SHA-256: STAGE5-AUTHORITY.json. Este bloque mantiene las tres gates5 pendientes y no marca otra fila de paridad completa.

## Cambios

Main comprueba que la ruta corresponde a una instancia Java registrada antes de activar/desactivar mods. La comprobación usa el estado nativo inicializado, no la selección de React, y el helper es privado de JavaScript (`#`) para no añadir un método accesible al dispatcher. La validación de archivos regulares/directos, colisiones y copia exclusiva del bloque anterior sigue vigente. Prueba real por IPC: una carpeta con un JAR válido pero no registrada se rechaza para ambas acciones y conserva los bytes.

La cabecera vuelve a crear su imagen al cambiar la URL. Una prueba encontró que el atributo hidden no bastaba: el estilo global img display:block prevalecía. Ahora el fallo oculta la imagen por estilo local y la nueva URL crea un nodo sin ese fallo. Se prueba error inyectado en la imagen anterior, cambio de icono mediante editInstance nativo y decodificación/visibilidad de la nueva imagen.

Se espera el inventario de dos mods tras cada reload antes de capturar. La prueba de portada demorada comprueba ventana/WebContents con foco, botón habilitado y foco del teclado antes de Enter. El fallo original no contiene evidencia DOM/foco suficiente para adjudicar una causa física; no se inventa una explicación del producto. Cinco repeticiones consecutivas del flujo reforzado pasaron.

La fixture copia los PNG y su manifiesto en la carpeta propia de cada prueba, conservando además las rutas del tutorial. Los errores de artefactos se notifican después de cerrar Electron y limpiar el perfil de fixture, fuera de finally, sin reemplazar el fallo del cuerpo de una prueba. CI usa carpetas de salida distintas para React/StrictMode/Vue: la siguiente invocación de Playwright no debe borrar la evidencia anterior.

## Validación acotada

- Once casos distintos de React sobre la aplicación a5f3ed7: specs26/27/31, 32,4s. Incluyen los seis casos de Mods/cabecera y las cinco regresiones de iconos/portadas. Tipos runtime/React y lint aprobados; detector sin hallazgos.
- Fixture1769d88: seis casos31 repetidos, 18,3s; ocho capturas/manifiesto conservados y comprobados en su propia carpeta. Portada demorada repetida cinco veces, 12,1s; no se suma como cinco funciones nuevas.
- Ajuste final de limpieza5614fcd: caso de navegación/mods/capturas, 8,8s; ocho PNG/manifiesto verificados. Compatibilidad/onboarding Vue: dos casos, 9,7s. Tipos E2E conservan56 diagnósticos antiguos, cero en la fixture yspec31; lint de fixture/specs27/31: cero advertencias/errores.
- La ejecución anterior completa5c79ece mantiene597unitarias/70React/1Strict/2Vue, con CI40453332395(db85a03) exitoso en ambos jobs. No se presenta esa pasada como una nueva ejecución completa sobre a5f3ed7.

Se revisaron las capturas finales únicas de cabecera oscura800×400 y lista clara1200×720; los dos mods están presentes al capturar. El resto de tamaños/temas se mantiene en las pruebas y sus PNG/JSON. Dos mensajes nativos de command buffer GPU aparecieron al cerrar Electron en la primera pasada exitosa a5f3ed7; no hubo fallo por pageerror y las pasadas siguientes aprobaron. No se usa esta prueba como certificación de rendimiento/GPU o accesibilidad completa.

## Límites y siguiente trabajo

Cinco PNG históricos de5c estaban en rutas compartidas y fueron sobrescritos antes de conservarlos. STAGE5-WORKSPACE registra sus hashes originales como no disponibles y recupera tres capturas con bytes idénticos; no reemplaza evidencias históricas con imágenes actuales. Los logs/JSON originales siguen en carpetas únicas. EXE/ASAR se identifican por sus hashes al probar aunque una compilación posterior reemplace sus rutas.

Vue termina como default/dist y producción no cambia. No hay pruebas nuevas de Java/partida/NSIS/delta reales ni benchmark físico. La revisión de seguridad es acotada a estas operaciones, no una certificación del conjunto del launcher.

Continuar con contenido de etapa5: grupos y migración persistida (nativo incluso vacío prevalece), instalar/retirar/información/actualizar/dependencias, luego packs/shaders/mundos/ajustes/consola. El servicio viejo de grupos todavía publica estado antes del write y oculta errores; no usar esa conducta ni eliminar modsGrouping antes de confirmar persistencia. Mantener el plan completo y las etapas6–9 intactos.
