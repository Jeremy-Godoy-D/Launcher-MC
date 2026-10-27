# Etapa 5 — primer bloque: espacio de instancia y mods locales

Fuente: `5c79ece3ef2375375a44b5f3999e087e40b66347`. Fecha: 2026-10-27. **Avance parcial; las tres gates de etapa 5 y las filas de paridad pendientes continúan abiertas.** El manifiesto JSON adjunto identifica 16 fuentes por sus blobs Git, cuatro binarios/ASAR y los artefactos ignorados por SHA-256.

## Comportamiento conectado

Cabecera común a las secciones de la instancia: identidad, versión/loader, estado de partida/copia, Jugar explícito y menú existente. Resumen muestra runtime, actividad, tiempo y carpeta con recuperación de error. Rutas `/instance`, `/instance/mods`, `/instance/resourcepacks`, `/instance/shaderpacks`, `/instance/save`, `/instance/base-setting`, `/instance/console`; atrás/adelante conserva selección literal. Las cinco secciones posteriores a Mods siguen mostrando pendiente, no se consideran funcionales.

Mods adquiere `ResourceState` por clave y ruta mediante renderer-client. Lee archivos y errores de análisis, muestra nombre/versión del loader y origen conocido, busca/filtra, selecciona varios y activa/desactiva mediante IPC nativo. No hay filesystem, Java ni credenciales en React. Los comandos capturan ruta/archivos; un componente retirado no aplica respuestas al nuevo destino. Comprobación de proceso antes de modificar y bloqueo visual si esa instancia está jugando. No se afirma que esto sustituya las validaciones de main ni la revisión final de permisos.

El servicio antiguo ocultaba errores de rename. Ahora valida el conjunto de archivos directos/regulares y el directorio de mods, publica el nuevo nombre sin sobrescribir y elimina el anterior solo después. Una colisión rechaza y conserva ambos archivos; los errores llegan a la UI. Si el volumen no permite hard links, se usa copia exclusiva. Es una operación por archivo, no una transacción de lote: un fallo posterior puede dejar cambios anteriores aplicados y el mensaje solicita volver a leer. La UI revalida tras confirmar el comando: el watcher de Windows no siempre emite el alta de un hard link nuevo.

Medios de cabecera reutilizan Ambient y la política de pausa, sin otro motor: un decoder, sin precarga de vídeo y sin precarga de la siguiente instancia fuera de Inicio. Pausa con interacción/diálogo/minimización y al salir de vista; rendimiento/movimiento reducido retiran el vídeo. Identidad de pack usa su portada nativa validada y etiqueta el ambiente Vanilla genérico; la prueba extendida 27 usa su caché aislada ya existente.

## Verificación

Desde `launcher`, renderer React y host empaquetados; `pnpm check`, `pnpm lint` y el comando Vitest completo de `.github/workflows/react-migration.yml`: **597 pruebas/63 archivos**, 13,83 s. El workflow incorpora la regresión de la operación exclusiva y la spec 31.

El comando React completo de ese workflow pasó **70 escenarios, 4,2 min**. StrictMode: **1/4,3 s**; compatibilidad/onboarding Vue: **2/10,8 s**, después de reconstruir el host Vue. Total 73 escenarios funcionales distintos; los intentos previos no se suman. `dist` termina en Vue y el default no cambia. Nueve pruebas del harness y su check pasan.

Spec 31 tiene cuatro casos: archivos reales en dos instancias y selección/filtros/lote/atrás-adelante; colisión y operación nativa demorada al cambiar A→B; fallo de watch/reintento/carpeta vacía/JAR roto/selección ausente; decoder y pausas de cabecera. JARs Fabric mínimos de fixture, sin ejecutar Minecraft. Las colisiones, nombres, archivos y estados son nativos. La espera demorada y el primer fallo de watch se inyectan solo en el IPC aislado de pruebas. Fallback de hard link: ENOTSUP inyectado y copia real; no se probó un volumen FAT físico.

En la ejecución completa se conservaron **95 auditorías Axe: 0 violaciones y 166 comprobaciones incompletas**, incluidas cuatro nuevas (una incompleta cada una). No certifica AA completo. Se revisaron capturas de cabecera y lista, claro/oscuro, 1200×720 y 800×400; Jugar, pestañas y controles alcanzables mediante scroll sin solapamiento horizontal. Al reconectar, el scan nativo puede publicar los archivos de forma gradual; reforzar la espera de los dos registros antes de capturar para evitar fotografías de un estado parcial. Detector de fuente sin hallazgos.

Typecheck E2E global mantiene 56 diagnósticos anteriores; spec 31 tiene cero. Tipos de producto pasan. La calibración física de etapa 4 no se repitió: no hay una nueva afirmación de CPU/GPU/memoria. Instalación real de Java/partidas y NSIS/delta siguen en la aceptación final, con los límites anteriores intactos.

## Siguiente bloque

Completar contenido: instalación/retiro/información/actualización y diagnósticos/dependencias, grupos y packs/shaders. Revisar autoridad de ruta registrada en main para estas operaciones; no depender del filtro del renderer. Añadir key al logo de cabecera cuando cambie su URL para que un error anterior no mantenga oculta una imagen nueva.

Grupos: el servicio actual cambia estado antes del write y oculta el error; el consumidor Vue migra todas las rutas y elimina modsGrouping sin esperar persistencia. No copiar esa lógica. Archivo nativo existente, incluso vacío, tiene precedencia. Migrar por ruta con confirmación persistida y conservar el legado si falla; validar formato/seguridad y no sobrescribir cambios concurrentes. No exponer reglas/operaciones de servidor o publicación fuera de SCOPE.

Mundos, ajustes de instancia (Java manual/herencia incluidos) y consola siguen en etapa 5; catálogo 6, superficies globales 7, sustitución/retirada de extras 8 y publicación 9. No se publica este bloque ni se modifica la instalación habitual. Microsoft continúa pospuesto.
