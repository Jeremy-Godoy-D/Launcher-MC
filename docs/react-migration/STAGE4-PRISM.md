# Etapa 4 parcial — versiones personalizadas de Prism

Código `4ab24c728d7be8475cfe847c3dbda03dc30f7f2d`, 2026-10-25. K03 incorpora la importación confirmada de versiones standalone de Prism/MultiMC con metadatos base completos. Las tres gates de etapa 4 y K03 permanecen pendientes; Vue sigue predeterminado y producción no cambia.

## Qué conserva la importación

El diálogo revisa los parches declarados y las bibliotecas locales antes de habilitar la confirmación. La preparación permanece en main: el renderer recibe una huella y el runtime público necesario para contrastar la revisión. Al confirmar se vuelve a leer el origen, se verifica esa huella, se guarda una versión con ID propio estable y se registra/resuelve nativamente antes de crear la instancia. Cambiar los metadatos o los bytes de una biblioteca obliga a revisar otra vez. No se escriben versiones/bibliotecas durante la revisión.

La versión conserva mainClass, cliente descargable, bibliotecas y compatibilidad Java del ensamblador existente. Los argumentos `+jvmArgs` y `+tweakers` de los parches se traducen a argumentos intrínsecos de la versión, conservando los valores JVM por defecto de las versiones antiguas. Esa traducción se activa en el nuevo recorrido; los callers anteriores conservan su forma de aplicar argumentos, evitando duplicarlos. No se adoptan JavaPath, JvmArgs personales, comandos ni wrappers de `instance.cfg`. Los mods siguen siendo código del pack: la UI mantiene la indicación de usar packs de confianza.

`persistMmcStandaloneVersion` comparte una publicación que comprueba todos los conflictos antes de escribir. Un archivo existente con contenido distinto se conserva y bloquea la importación; los archivos iguales permiten reintentar. Los nuevos archivos se publican completos desde temporales propios mediante un enlace exclusivo, sin reemplazar destinos. Las bibliotecas se copian desde buffers, sin enlazar los archivos originales. Un fallo posterior al preparar la versión puede dejar una versión/biblioteca reutilizable sin instancia; no se hace rollback destructivo sobre cachés compartidas.

Se validan rutas relativas y nombres Windows, enlaces/junctions, tipos de archivo, identificadores de versión, rutas de artefactos y URL HTTP/HTTPS sin credenciales. Los hashes SHA-1 y tamaños declarados de bibliotecas locales deben coincidir. Hay límites de 1 MiB por metadato JSON, 8 MiB JSON total, 256 componentes/parches y 256 MiB total de bibliotecas locales. La huella cubre los metadatos interpretados y los bytes de las bibliotecas. La copia de archivos de juego conserva la comprobación de integridad y la ruta retenida del bloque anterior.

La UI diferencia origen cambiado y conflicto de biblioteca/versión, explica la recuperación y mantiene los campos. Revisar un origen válido limpia el error previo. Se elimina la ruta duplicada cuando origen y perfil coinciden y se corrige el contador singular mediante «Archivos: N». El texto distingue argumentos de una versión de los ajustes personales del launcher de origen.

## Verificación

- 349 unitarias en 36 archivos, 11,69 s. Incluyen los once casos nuevos de Prism/publicación segura y las regresiones existentes del importador de directorios, packs, renderer-client, Java, persistencia y actualizador. Se prueban bytes cambiados, conflicto sin escrituras parciales previas, reintento, concurrencia, junctions, rutas, hashes y argumentos necesarios sin comandos personales.
- 27 recorridos Electron React, 1,5 min; uno Strict Mode, 4,4 s; dos Vue, 10,3 s: **30 escenarios distintos**. Los cinco de specs 14/15 se repitieron después de los últimos cambios de validación/copy, 15,5 s; se solapan con la regresión, no son escenarios adicionales.
- El nuevo recorrido utiliza parser, preparación, registro/resolución de versión, copia de biblioteca/mundo y persistencia nativos. Confirma que no se crea una instancia al revisar o al fallar por cambio/conflicto, conserva la versión al recargar y comprueba Java 17 en los metadatos resueltos. Las bibliotecas/clientes son fixtures; no se ejecuta el código de esos JAR ni se descarga un cliente real.
- Tipos raíz aprobados, runtime comprobado de nuevo tras los últimos guards, lint sin errores/avisos, nueve pruebas del harness. Renderer y host Windows construidos/empaquetados para React/Vue; dist restaurado a Vue. Se amplía el workflow, sin afirmar que se ejecutó en GitHub.
- Formularios revisados en 1200×720 y 800×400, claro/oscuro. Se comprueban foco, scroll de la información y confirmación accesible. La regresión conserva 39 resultados Axe con cero violaciones/64 incompletos; la repetición final del área, ocho resultados con cero violaciones/24 incompletos. Son resultados solapados y no certifican AA/RTL manual. Detector de fuentes sin hallazgos; no ejecuta reglas que necesitan página parseada ni se conectó DevTools CLI/CDP.

Comandos desde `launcher`: conjunto Vitest de `.github/workflows/react-migration.yml`, `pnpm check`, `pnpm --prefix xmcl-runtime check`, `pnpm lint`, `LAUNCHER_RENDERER=react pnpm gen:testids`, build de renderer/host React y specs 01/02/05/06/07/09/10/11/12/13/14/15 sobre su EXE empaquetado. Spec 04 con `XMCL_REACT_CLIENT_HARNESS=1`; build renderer/host Vue y specs 03/08. Compilación final del host con target Vue; nueve tests y check del harness. Siempre raíces temporales, sin ejecutar un instalador sobre datos habituales.

`STAGE4-PRISM.json` identifica el commit, 16 hashes de archivos Git y 53 artefactos ignorados. Las cuatro capturas finales del área están en `launcher/e2e/artifacts/prism-final-area/visual`.

## Límites y continuidad

Falta K03 de versiones Vanilla personalizadas: herencia de JSON, cliente/JAR y bibliotecas compartidas. Prism aún rechaza parches sin metadatos suficientes para una versión standalone, alias `jar` y destinos locales de artefactos diferentes de la ruta Maven; completar esos casos antes de declarar paridad total. La publicación exclusiva se probó en Windows/NTFS; otros sistemas de archivos y plataformas no se validaron y un fallo de publicación se propaga sin reemplazar archivos existentes.

No se ha validado una partida real, descarga de Java/cliente real, NSIS, actualización/delta aislada, firma, publicación ni rendimiento 60 s. El escaneo ya iniciado no se cancela al cerrar: se ignoran resultados obsoletos. Después de K03 siguen las operaciones de K02/K04 y el resto de la migración. Microsoft pospuesto; proxy, datos e identificadores conservados. `ANALISIS_ARQUITECTURA.md` permanece intacto.
