# Progreso local: lectores acotados y recuperación

Fuente `2b1c02bc34132ae3b69496af5c6f1a049ab9dc49`. Etapa 5 activa; K11/K12/K21 pendientes. Se conservan avances, misiones, estadísticas, recursos locales y todas las herramientas de mundos confirmadas por el usuario.

## Cambio comprobable

Las lecturas de progreso comparten presupuesto, validación de pertenencia y rechazo de enlaces en archivos/directorios secundarios. JSON y SNBT tienen límites estructurales; errores de estadísticas dejan de presentarse como éxito vacío. La resolución local de versiones valida IDs/herencia/clientes/índices sin recursión de disco sin límite. Idiomas e índices usan los mismos lectores; se conserva UTF-8 BOM, la traducción del cliente y la precisión de los long de SNBT.

Los JAR/ZIP se indexan una vez, sin recorrer todo el archivo por cada directorio. Se rechazan rutas ambiguas, traversal, symlinks y tamaños inválidos; la extracción por streaming verifica longitud y CRC32. El lector CRC existente de datapacks se reutiliza sin perder sus errores tipados. No se añaden dependencias ni privilegios de renderer.

Los modelos de iconos validan referencias y detectan ciclos. La carga opcional termina de forma secuencial y cierra archivos en finally: se elimina la carrera de Promise.race que dejaba trabajo activo. La caché tiene límites y caducidad. El árbol de avances se distribuye mediante un recorrido iterativo: una cadena de 6.000 nodos y ciclos sin raíz no desbordan la pila ni desaparecen del resultado.

React envía el locale real, retira resultados anteriores al volver a leer, ofrece recuperación visible y conserva un capítulo seleccionado solo si sigue existiendo. Distingue Pendiente/Bloqueado, traduce las clases de avance y corrige el nombre accesible del cambio lista/árbol. Se separaron los metadatos de las filas con el estilo existente, sin sustituir el diseño aprobado.

## Presupuestos y compatibilidad

- Presupuesto común: 64 MiB, 100.000 entradas y 15 s, comprobado entre operaciones. No es un mecanismo de cancelación inmediata de una llamada del sistema bloqueada. El coste de ZIP incluye bytes comprimidos/descomprimidos y una estimación conservadora de sus metadatos/extra fields.
- JSON y SNBT hasta 4 MiB; JSON profundidad 64 y 200.000 nodos; SNBT profundidad 64 y 100.000 nodos. Textos traducidos: 16.384 caracteres, profundidad 64 y 2.048 nodos, con interpolación acotada.
- Versiones: máximo 32 ancestros; recursos ZIP: archivo de hasta 512 MiB, rutas de hasta 2.048 caracteres/32 niveles. Avances y misiones hasta 10.000; capítulos FTB hasta 256.
- Arte opcional: ventana restante máxima de 3 s, hasta 150 iconos y 32 archivos abiertos secuencialmente; modelos hasta 8 referencias y 256 KiB. PNG estático hasta 512 px/64 KiB. Caché LRU de 128 entradas y 4 MiB de caracteres URL, con TTL de 30 s.

Estos límites pueden rechazar packs locales excepcionalmente grandes; el error es recuperable y no modifica sus archivos. Un icono opcional inválido usa fallback; un archivo principal de progreso inválido informa error. No se borran datos ni se descarga contenido para completar el visor.

## Evidencia y reproducción

Manifiesto ignorado `launcher/e2e/artifacts/stage5-progress-readers-manifest.json`, SHA-256 `ba86b2828bf03ea9680418baab2e385bc7b7e71832f686729a4f97471a5016ec`: 19 fuentes canónicas de Git y 55 artefactos, incluidos ASAR/main React/Vue y copias propias de las diez capturas. No depender de las rutas compartidas de build/capturas después de otro bloque.

- Regresiones antes del arreglo: tres de seguridad de progreso y una de SNBT fallaban contra los originales restaurados temporalmente y recuperados mediante finally. Focal final: **33/33** en seis archivos.
- Línea unitaria exacta de `.github/workflows/react-migration.yml`, ejecución final independiente: **1.092 pruebas / 110 archivos**, 24,49 s. Un intento anterior terminó 1.091/1.092 por el timeout exterior de la prueba que prepara 256 archivos del instalador. Se amplió ese timeout a 20 s para incluir preparación/finalización; su aserción de disponibilidad sigue limitada a 10 s y conserva las 257 comprobaciones de datos. No se cambió el instalador. Una ejecución verde solapada brevemente con tsc no se utiliza como prueba de aislamiento; la ejecución release fue posterior y sin tareas concurrentes.
- `pnpm check` aprobado en los seis paquetes, más comprobación final de runtime/React. `pnpm lint`: cero errores y un aviso previo de no-control-regex en queryModUpdates.ts. TypeScript E2E: los mismos **56 diagnósticos base**, sin nuevos al normalizar coordenadas.
- Renderer y host React compilados; Playwright sobre el **EXE empaquetado**, specs61/66/67/72, locale es-ES, `--retries=0 --reporter=line`: **13/13**, 39,1 s. Incluye rechazo de un player file enlazado con sentinel externo intacto, recuperación al corregirlo, avances/misiones, recursos de un JAR sintético localizado con BOM, PNG realmente decodificado y estadísticas inválidas que no dejan datos viejos visibles.
- Matriz éxito/error × claro/oscuro × ventanas Native 1200×720/800×400, foco mediante teclado, desplazamiento y recuperación. **20 informes Axe, cero violaciones; 24 incompletos**: 20 contraste y 4 aria-hidden-focus en los diálogos existentes de datapacks. Capturas finales revisadas; no equivale a certificación manual exhaustiva de AA. Detector de WorldProgress: un aviso de tamaño tipográfico preexistente; no se rehízo el diseño.
- Vue renderer/host recompilados y dist compartido restaurado a Vue; specs03/63 con su EXE: **2/2**, 7,9 s. Un primer comando usó nombres de specs inexistentes y no ejecutó pruebas; el log verified contiene la ejecución correcta.
- Nueve tests del harness aprobados. El check se realiza tras registrar este informe, en `stage5-progress-readers-harness-check.log`, fuera del manifiesto para evitar circularidad.
- CI previos comprobados por SHA: [41279948321 /2525449](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41279948321) y [41281063903 /b23a888](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41281063903), ambos completos y success en Vue y React. Comprobar el nuevo SHA al subir; estos resultados no certifican automáticamente esta fuente.

Comandos: línea Vitest del workflow; focal de progressFiles/progress-security/progress/snbt/advancements/worldDatapacks; `pnpm check`, `pnpm lint`, `pnpm --dir e2e exec tsc --noEmit`; builds `LAUNCHER_RENDERER=react|vue`; Playwright con `XMCL_E2E_EXECUTABLE` del paquete correspondiente y output propio; `node --test launcher/scripts/react-migration.test.mjs` y `node launcher/scripts/react-migration.mjs check`. Se usa la alternativa autorizada Playwright Electron; no DevTools CLI.

## Pendientes que impiden cerrar la etapa

1. K11: proteger escrituras frente a una partida externa mediante el bloqueo real de session.lock. Las guardas actuales solo acreditan procesos administrados. Mantener la auditoría IPC de operaciones legacy para etapa 8 y los límites documentados de chunks/entidades/POI/mods; no rehacer los lectores internos ya cubiertos aquí.
2. K12: preservar argv exactos con espacios/comillas, herencia/vacío explícito, cambios sin guardar y conflictos. K21: dos procesos en vivo aislados, fragmentos/lotes, virtualización, seguimiento y recuperación de copia/exportación.
3. El log Native conserva un aviso DEP0005 de Buffer() en el recorrido ZIP; su origen exacto no se trazó. Revisar dependencias/grafo en etapa 8. No se registraron errores de página en los casos positivos de72; no afirmar consola completamente silenciosa.
4. Recursos JAR, mundos y procesos de estas pruebas son sintéticos; no acreditan juego/Java reales, NSIS/delta aislados ni medición CPU de 60 s de este bloque. Etapas6–9 pendientes, Microsoft pospuesto, PR4 borrador, versión/producción/proxy sin cambiar. Los dos archivos WIP de DOMPurify siguen fuera de commits.
