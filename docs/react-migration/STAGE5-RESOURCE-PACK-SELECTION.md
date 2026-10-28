# Etapa 5 — selección y prioridad de resource packs

Fuente `d63be84c411a9734b74b0ffd835d99d087651feb`. Etapa 5 y K09 siguen pendientes. Este bloque añade lista real, búsqueda, activación/desactivación y prioridad; no completa toda la gestión de packs.

## Comportamiento

Packs utiliza ResourceState y el servicio existente de resource packs. La selección se lee directamente de options.txt, sin crearlo al montar la pantalla. Muestra primero la prioridad más alta, invirtiendo el orden persistido de Minecraft. Conserva entradas builtin/mods/archivos ausentes, nombres legacy sin prefijo y carpetas desempaquetadas con su nombre real, sin forzar .zip. Desactivar no borra archivos. Origen y formato se muestran desde metadatos disponibles; la tabla de rangos existente es parcial y los formatos sin rango se identifican como desconocidos.

getResourcePackSelection/editResourcePackSelection son métodos Native nuevos y acotados. Comprueban instancia Java registrada, directorio real y límites de datos; el guardado comprueba otra vez el registro bajo lock, procesos conocidos de esta instancia y partidas que usan los mismos ajustes globales compartidos. SHA-256 vincula bytes, inode/dispositivo y número de enlaces; rechaza un cambio de archivo o vínculo desde la lectura. No es un token de autenticación.

Solo cambia la línea resourcePacks y conserva las otras líneas y CRLF. Nuevas entradas deben ser locales directas existentes; rechaza traversal, identificadores inválidos, junctions ajenos y enlaces de archivos. Acepta únicamente el directorio compartido Native autorizado. Un options.txt con múltiples enlaces solo puede escribirse si comparte inode/dispositivo con el archivo global conocido. La UI advierte antes de aplicar a todos los vinculados. El archivo privado se publica desde temporal exclusivo; el explícitamente compartido se escribe conservando su inode. Esa escritura compartida no es atómica ante un corte/interrupción.

El orden es accesible mediante flechas y teclado. Las filas conservan identidad al moverse, el foco vuelve a la acción o a su alternativa disponible en el límite y el redimensionado conserva el control visible. No se roba foco si el usuario lo cambió durante el guardado. La selección y sus errores se aíslan por instancia.

## Validación

- 792 unitarias/83 archivos,20,87s, lista explícita del workflow. Son22 pruebas nuevas de selección y guardas Native sobre las770 previas. Incluyen CRLF/líneas ajenas, opciones malformadas, selección obsoleta, nombres con dólares, carpetas, junctions, vínculos compartidos/ajenos, cambio de enlace con bytes iguales, registro/Bedrock/proceso y otra partida compartida.
- Tipos raíz aprobados después del formato de snapshot compartido; tipos runtime/React y lint raíz nuevamente aprobados tras la guarda de partidas vinculadas. E2Etsc conserva56 diagnósticos previos, cero en43. No se afirma compilación E2E global correcta.
- Ejecutables finales:6 React35/43 en22,8s y3 Vue03/08/33 en21,2s:9 escenarios distintos. Tres de43 repetidos tras ajustar espacio entre estado y encabezado,11,0s; no aumentan el total. Conserva ZIP, archivo sintético de mundo, opciones ajenas, otra instancia e inode de ajustes compartidos. Servicios/FS/guardado reales; archivos de pack sintéticos, sin iniciar Minecraft ni descargar contenido. La guarda de procesos se prueba con procesos simulados en unitarias, no con una partida real.
- Auditorías vigentes por área35/43: 8, cero violaciones/8 incomplete, 13 PNG. Capturas claro/oscuro1200×720 y800×400, teclado/prioridad hasta el límite y foco al reducir ventana; captura adicional del aviso compartido. Revisión visual realizada; AA manual exhaustiva pendiente. Se conservan los fallos iniciales de foco/resize y la invocación Vue sin nombres correctos, sin quitar aserciones.
- Ambos renderers/hosts reconstruidos. Después del último CSS se reconstruyó React y se repitió43; dist compartido restaurado con compile Vue. Default Vue, versión sin aumentar. Harness9 y check al guardar el bloque. CI40773494245 pasó React/Vue sobre4d716c0/dbc4473; este source requiere CI propio tras push.

Comandos desde launcher: lista vitest del workflow; pnpm check/lint y checks focales runtime/React; pnpm --dir e2e exec tsc --noEmit; build:renderer y build de host con LAUNCHER_RENDERER; Playwright con ejecutable propio, es-ES y specs citados. Desde raíz: node launcher/scripts/react-migration.mjs check y node --test launcher/scripts/react-migration.test.mjs.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-packs-selection-artifact-manifest.json`, SHA-256 `888f6e9cfe08e7622e03d7feaa105d38226148f95bd581b00a28862caca23193`. Incluye14 fuentes Git canónicas, logs fallidos/aprobados, artefactos y hashes EXE/asar de ambos outputs mutables al capturarlos.

## Siguiente trabajo y límites

Continuar importación/retirada local, información/grupos/gestión de compartidos y actualizaciones de packs; reutilizar instalador/revisión y servicios del núcleo. Después shaders, mundos, ajustes, consola y etapas6–9. K08/K09 y gates5 pendientes. No volver a implementar selección/orden ni repetir todo el bloque de mods por rutina. No añadir botones de importación/retirada sobre los métodos legacy sin resolver confirmación y conservación de datos.

Estas guardas son para los métodos nuevos, no certifican toda la API legacy de ajustes ni reemplazan la retirada de IPC/extras de la etapa8. No se certifican compatibilidad de juego, carrera con escritores externos, recuperación de corte eléctrico en ajustes compartidos, Java/juego/NSIS/delta reales ni presupuestos finales. Producción/proxy intactos, Microsoft pospuesto y PR4 borrador. No DevTools/CDP, no tocar ANALISIS_ARQUITECTURA.md ni reintentar limpiezas denegadas.
