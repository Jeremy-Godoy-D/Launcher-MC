# Etapa 4 parcial — completar la base Minecraft de Prism

Código `7ea3348087a591f77c531715d743c9a8d1e12ff0`, 2026-10-25. K03 puede conservar parches Prism que no incluyen toda la definición base de Minecraft. Las tres gates de etapa 4 y K03 permanecen pendientes. Este bloque sustituye el límite general de base incompleta de los informes anteriores por el alcance concreto descrito aquí. Producción sigue en la referencia Vue.

## Resolución y confirmación

Si los parches no forman una versión standalone completa, se busca el JSON de Minecraft en las carpetas de versiones del origen y de su directorio de juego. Si falta allí, main consulta la caché administrada del launcher; solo si también falta se usa el catálogo nativo de versiones para obtener los metadatos oficiales. Los parches completos mantienen su recorrido anterior, sin consulta adicional de base.

La base debe corresponder al Minecraft declarado, ser independiente y tener los campos de lanzamiento necesarios. No se sigue herencia personalizada ni un alias de cliente desde esa base: esos casos siguen sus otros recorridos admitidos. Se rechazan rutas/enlaces peligrosos, identidad incorrecta, claves de contaminación de prototipos, protocolos no admitidos, anidamiento excesivo y metadatos grandes. El cliente y las bibliotecas locales conservan sus verificaciones anteriores.

El fetch recibe únicamente una versión elegida desde los metadatos nativos. Acepta HTTPS en los dominios oficiales permitidos, sin puertos alternativos, credenciales, query, fragmento ni redirecciones. La URL debe llevar el hash SHA-1 inmutable de los bytes; se verifica la respuesta contra ese hash. Hay timeout de 20 segundos y límite de lectura de 1 MiB. No se descarga ningún JAR en esta operación ni se añade un fetch arbitrario a renderer.

La composición vive en `mmcStandaloneVersion`, dentro del runtime: normaliza los argumentos base, respeta reglas condicionales y el reemplazo legacy, y reutiliza el combinador existente de componentes. Mantiene bibliotecas, cliente, assets, Java y logging base; los parches aplican sus cambios y argumentos intrínsecos en orden. No importa comandos, ejecutables Java ni argumentos personales de `instance.cfg`. No se incorporó Node a los módulos compartidos del renderer: la compilación detectó esa dependencia durante el desarrollo y se corrigió trasladando la composición al runtime.

La revisión no publica una versión. Al confirmar se vuelve a leer la base y el origen; la huella incluye la base completa. Un cambio obliga a revisar otra vez antes de crear. El resultado conserva IDs propios y el cliente aislado `.client-*`; los metadatos y bytes oficiales ya instalados no se reemplazan. La publicación utiliza la comprobación inmutable existente. El JSON remoto se mantiene en memoria durante la inspección: si no existe una copia local, una confirmación posterior vuelve a necesitar la consulta; los fallos conservan el diálogo y permiten reintentar.

## Evidencias

- 409 pruebas unitarias en 44 archivos. Nuevos casos cubren bases del origen/caché, huella modificada, componentes ausentes, validaciones de base, argumentos modernos/legacy y logging. El fetch prueba origen permitido, ausencia de versión, credenciales/query/protocolo, errores HTTP, hash incorrecto y exceso de tamaño.
- 33 escenarios Electron React, uno Strict Mode y dos Vue: **36 escenarios distintos**. Los cinco del área ejecutados antes de la regresión son solapados, no adicionales. No se quitaron aserciones ni se amplió un timeout del producto para obtener esos resultados.
- Spec 18 usa las funciones nativas de revisión, preparación, registro y resolución. Dos recorridos completan la base desde el origen o desde la caché administrada. Comprueban revisión sin creación, cambio de base bloqueado, Java y bibliotecas del pack, argumentos, persistencia, mundo copiado, cliente privado y bytes oficiales intactos. El cliente de prueba es sintético y no se ejecuta.
- Smoke adicional con los metadatos oficiales reales de Minecraft 1.7.10 y 1.21.1: 14.777 y 38.408 bytes respectivamente, hash verificado y cliente declarado presente. Solo se descargaron sus JSON. No es prueba de instalación o lanzamiento del juego ni del transporte `app.fetch` dentro de Electron; este último queda conectado y comprobado por tipos.
- Tipos raíz, lint sin avisos/errores y nueve pruebas del harness. Builds renderer/host Windows para React y Vue; `dist` termina en Vue. Workflow ampliado, todavía no ejecutado en GitHub.
- La regresión conserva las comprobaciones visuales existentes a 1200×720 y 800×400, claro/oscuro. Las dos capturas nuevas muestran el flujo en ventana mínima. Axe se resume en STAGE4-PRISM-BASE.json; sus incompletos requieren revisión manual. No se conectó DevTools CLI/CDP.

Comandos desde `launcher`: conjunto Vitest del workflow, `pnpm check`, `pnpm lint`, `pnpm exec tsx e2e/artifacts/partial-live-metadata.ts`, renderer/host React y specs 01/02/05/06/07/09/10/11/12/13/14/15/16/17/18 sobre su EXE con locale es-ES. Spec 04 con `XMCL_REACT_CLIENT_HARNESS=1`. Renderer/host Vue y specs 03/08 sobre su EXE. Desde raíz: nueve pruebas de `launcher/scripts/react-migration.test.mjs` y `react-migration.mjs check`. Logs, resultados y capturas están ignorados; STAGE4-PRISM-BASE.json conserva hashes de los nueve archivos del commit y de los artefactos de validación.

## Pendientes y límites

Completar la base Minecraft no reconstruye componentes del loader u otros componentes declarados que tampoco tengan su parche. Esos conjuntos se bloquean antes de buscar una base, en vez de perder parte de su configuración. Siguen pendientes la revisión de paridad restante de K03 y las operaciones K02/K04: editar, duplicar, agrupar, ordenar, exportar y eliminar con confirmación. No repetir la implementación ya cubierta de base Minecraft, Vanilla/herencia ni clientes aislados al retomar.

No se verificaron descarga real de Java/cliente, partida Minecraft/loaders, NSIS, actualización/delta aislada, firma, rendimiento de 60 s ni publicación. Conservan vigencia los límites de publicación en Windows/NTFS, caché reutilizable tras un fallo posterior y lecturas nativas no canceladas al cerrar. Microsoft permanece pospuesto; identidad Grimo, datos y proxy conservados. `ANALISIS_ARQUITECTURA.md` intacto.
