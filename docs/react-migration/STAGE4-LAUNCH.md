# Etapa 4 parcial — preparación de lanzamiento y Java automático

Código: `734b00627944439325c127348304cecd06d790b5`, Windows, 2026-10-25. Se conecta Jugar a los servicios existentes y se incorpora la aclaración del usuario sobre Java automático. **Las tres gates de etapa 4 siguen pendientes.** Vue continúa como renderer predeterminado; no se publica una versión.

## Comportamiento conectado

Jugar captura la ruta y el perfil local del clic. Primero comprueba la cuenta, existencia/permisos de la carpeta, versión, instalación pendiente y Java; no instala ni inicia Minecraft por navegar o abrir el diálogo. La confirmación distingue Jugar de Instalar y jugar. Mientras prepara conserva el botón deshabilitado en su posición: un doble clic no crea otro proceso ni pulsa accidentalmente Cancelar.

Al confirmar, recupera instalaciones interrumpidas, aplica el manifiesto retenido, vuelve a comprobar archivos pendientes y usa VersionInstallService para resolver/instalar Minecraft y su loader. Las configuraciones de ejecución modificadas durante la preparación requieren nueva revisión. Conserva el perfil capturado aunque cambie la selección visual y comprueba que todavía exista antes de lanzar. Reutiliza generateLaunchOptionsWithGlobal para argumentos, entorno, RAM, resolución, comandos explícitos del usuario y comportamiento de ventana; comprueba RAM antes de crear el proceso. Los errores se presentan como categorías recuperables, sin mostrar opciones privadas ni errores crudos.

Se sincronizan procesos iniciales y eventos de inicio/salida, se muestra el PID y se ofrece Detener partida. Una salida anterior al resultado de lanzamiento o a la consulta inicial no resucita el proceso en la UI. El carrusel/vídeo se pausa si hay partidas activas y puede reanudarse al terminar, respetando foco, interacción, rendimiento y movimiento reducido. El cierre de ventana libera listeners y adquisiciones a través del cliente compartido.

## Java solicitado por el usuario

La aclaración del 2026-10-25 se añadió a SCOPE.md. Si falta un Java compatible, se solicita su instalación nativa **después de la confirmación**. El requisito se obtiene de la versión resuelta y las reglas existentes de compatibilidad del loader; no se fuerza el mismo Java a todos los packs. Antes de resolver una versión que todavía no está instalada, la UI indica que el requisito se determinará durante la preparación.

Se reutilizan InstallCoordinator/JavaInstall, con destino `jre` dentro de los datos del launcher, fuente oficial y estrategia alternativa existente, verificación del manifiesto/archivos y comprobación del ejecutable. No se añade un instalador paralelo ni se modifica PATH o el Java del sistema. Si el Java fijado es inválido/incompatible, se puede usar uno compatible sin sobrescribir esa preferencia.

La UI explica la descarga automática y muestra su estado. Si falla, conserva el requisito conocido, permite reintentar y enlaza a la [página oficial de Eclipse Adoptium](https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64), filtrada por la versión conocida cuando está disponible. Volver a detectar Java vuelve a escanear ubicaciones mediante JavaService y abre una nueva revisión; **no inicia el juego por detectar una instalación manual**. El selector de ejecutable/carpeta personalizada y la herencia global/por instancia siguen dentro de los ajustes Java del plan; todavía no se presenta ese selector como implementado.

## Correcciones compartidas

- validateInstancePath rechaza rutas relativas o carpetas ausentes antes de la prueba de escritura. No recrea silenciosamente una instancia cuyo directorio desapareció.
- watchInstanceInstall adquiere y revalida unresolved-files.json con el esquema existente, serializa las lecturas coincidentes y falla cerrado ante contenido malformado. El watcher deja de publicar null como una lista válida.
- createOperationId se extrae del comando existente al helper común de lanzamiento. React y CLI reutilizan su alternativa para el origen HTTP empaquetado, donde randomUUID no está disponible. No se importa el registro completo de comandos ni los extras de XMCL en React.

## Validación

263 pruebas unitarias en 27 archivos, más repetición final de las 13 del nuevo flujo; tipos completos y comprobación React final; lint sin avisos/errores; nueve pruebas del harness. Se incluyen las pruebas existentes de compatibilidad Java, descubrimiento, manifiesto e instalación, además de selección/instalación simulada de Java 8/17/21, fallo de descarga, detección manual, cancelación, RAM, perfil capturado, configuración cambiada, adquisiciones tardías y carreras de procesos.

20 recorridos de Electron React sobre el EXE empaquetado, uno de Strict Mode y dos de compatibilidad Vue: **23 aprobados**. Los nuevos casos comprueban ruta física desaparecida, perfil ausente, doble clic, recuperación del manifiesto de un mrpack real tras destruir el renderer, conservación de carpeta/archivos, proceso restaurado tras recargar, parada por teclado y pausa/reproducción real del MP4 con proceso sintético. Se restablece foco nativo/WebContents y se retira el puntero de la destacada para medir reproducción, sin eliminar sus guardas de pausa.

Se revisaron visualmente los diálogos en 1200×720 y 800×400, claro/oscuro, y la alternativa manual Java con cuerpo desplazable y pie accesible en 800×400. El detector de fuentes de LaunchDialog/launch.css no encontró incidencias. STAGE4-LAUNCH.json conserva el recuento Axe, incompletos, hashes de 20 archivos de código y artefactos ignorados; no se confunde un análisis automático sin violaciones con una certificación manual AA.

Comandos ejecutados desde launcher: `pnpm check`, `pnpm --prefix xmcl-react-ui check`, `pnpm lint`, el conjunto Vitest de `.github/workflows/react-migration.yml`, `pnpm gen:testids`, `LAUNCHER_RENDERER=react pnpm build:renderer` y `pnpm --prefix xmcl-electron-app build`. Playwright ejecutó specs 01/02/05/06/07/09/10/11/12; 04 con XMCL_REACT_CLIENT_HARNESS=1; 03/08 después de compilar el host Vue en producción. El workflow se analizó como YAML; no se ejecutó en GitHub. `node --test scripts/react-migration.test.mjs` y `node scripts/react-migration.mjs check` completan la comprobación del harness.

## Límites y siguiente bloque

XMCL_E2E_NO_LAUNCH impide ejecutar Java real. Los proveedores, instalación/descubrimiento Java y registro/parada de procesos de los nuevos E2E son fixtures aisladas; los perfiles, rutas, servicios de instancias, ZIP local y aplicación del manifiesto sí son nativos. No se afirma descarga real de Java, ejecución de Minecraft/loaders, terminación real de un proceso del sistema ni instalación manual desde el enlace. La integridad del instalador Java tiene pruebas unitarias, no un recorrido de descarga pública en este bloque.

Continuar con K03: importación URL/carpeta, opciones avanzadas y preferencias de enlaces compartidos; después completar operaciones de instancia. Siguen pendientes edición/apariencia de perfiles, galerías/caché y presupuesto 60s, ajustes Java completos, tareas/consola detalladas y los demás recorridos del plan. Mantener abiertas K06/K18 y las tres gates: faltan ejecución real, diagnóstico integral y compatibilidad funcional completa. Microsoft, retirada de extras de runtime, instalador/delta aislado y publicación mantienen su etapa/estado anteriores. No se tocó ANALISIS_ARQUITECTURA.md ni la instalación habitual.
