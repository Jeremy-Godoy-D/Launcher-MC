# Carpetas compartidas de shaders

Fuente `da876d1e400bb61f7aac0cf728705f8b667ffd25`. Continúa K10 sin darlo por completo: las actualizaciones de shaders siguen pendientes.

React permite compartir shaders y crear una copia privada mediante revisión Native. Muestra carpetas/archivos/bytes y conflictos; no reemplaza ni renombra archivos para resolverlos. Conserva las configuraciones OptiFine/Iris/Oculus, grupos, opciones y mundos. Compartir no activa shaders. Los cambios posteriores en la carpeta común afectan a todas sus instancias vinculadas; una copia privada contiene todos sus archivos, carpetas vacías y copias independientes.

Se reutiliza `sharedResourcePacks` con dominio cerrado `resourcepacks | shaderpacks`, manteniendo resourcepacks como valor predeterminado. La revisión vincula hashes SHA-256, identidades de directorios, nombres y elección de carpeta. Rechaza rutas/enlaces ajenos, entradas enlazadas, raíces superpuestas, conflictos, árboles excesivos y cambios desde la revisión. Las copias son exclusivas y verificadas. Los shaders locales anteriores permanecen en `.backups/shaderpacks-share-UUID/previous` al compartir; un fallo conserva originales o copias y devuelve su ubicación, sin prometer rollback completo frente a escritores externos o fallos físicos.

`InstanceShaderPacksService` valida instancia Java registrada, revalida tras adquirir locks y bloquea la partida propia u otra que usa los shaders comunes. Pausa y reanuda el mismo observador al cambiar la carpeta. Las llamadas legacy `linkShared/unlinkShared` pasan por este flujo; ya no usan la vinculación heredada sin revisión/copias. Las pruebas del helper se ejecutan para ambos dominios. No se añadieron dependencias.

El diálogo común usa textos propios para shaders. Error, conflictos y datos están dentro del cuerpo desplazable; título y acciones permanecen alcanzables. La inspección de capturas encontró que el error podía quedar debajo del contenido en 800×400: el nuevo assert falló contra el paquete previo. Ahora aparece primero y el cuerpo vuelve al inicio cuando llega un error. El recorrido final exige ver el mensaje completo, además del título y confirmación.

## Validación

- **955 unitarias / 97 archivos**, lista completa del workflow aprobada en 26,13 s; **55 focales** del helper y servicios aprobadas. La primera ejecución amplia tuvo un timeout de 5 s en `persists legacy baseline removals across failure and a fresh-service resume` del instalador: el caso aislado pasó en 162 ms y la suite completa posterior pasó. No se alteraron código ni límites de esa prueba; la causa del timeout no quedó demostrada y sus logs se conservan.
- `pnpm check` y `pnpm lint` completos aprobados; check/lint React repetidos tras el ajuste del diálogo, sin avisos/errores. E2E tsc mantiene exactamente los **56 diagnósticos previos**, sin nuevos en 57/58 ni archivos afectados.
- **24 recorridos React distintos** con Native actual: 48/51/52/54/56/57, aprobados en 1,5 min. Después del ajuste visual final, se repitieron los **7 de 48/57**, aprobados en 30,8 s; no se suman como escenarios distintos. Cubren packs, alias Windows, shaders, selección, retirada, información y grupos. El ajuste final solo cambia el diálogo compartido y su assert de visibilidad; no cambia Native.
- 57 aporta cuatro recorridos: compartir/cancelar/desvincular/copias/configuraciones, colisiones y archivo obsoleto, matriz de revisión en ambas direcciones/temas/tamaños, e inyección real de un fallo `copyFile` Native con exactamente un fallo, originales conservados, observación reanudada y nuevo intento aprobado.
- **9 Axe nuevos: 0 violaciones / 22 incomplete**, revisiones claro/oscuro en 1200×720 y 800×400 y fallo en 800×400. Se inspeccionaron capturas de compartir claro 800, copia privada oscuro 1200 y error final claro 800; el error completo queda visible. No certifica AA manual.
- **4 recorridos Vue empaquetado**, 03/45/55/58 aprobados en 13,2 s. 58 comprueba los contratos Native legacy de shaders y copias independientes en el host Vue, no toda la pantalla Vue. Se construyeron ambos hosts; el renderer Vue sin cambios se reutilizó. `dist` y default quedan en Vue. Builds y recorridos Native fueron secuenciales.

Comandos desde `launcher`: lista `pnpm exec vitest run` del workflow; `pnpm check`; `pnpm lint`; `pnpm --dir e2e exec tsc --noEmit`; `LAUNCHER_RENDERER=react pnpm gen:testids`, `build:renderer` y `build`; Playwright con EXE React y specs 48/51/52/54/56/57, después 48/57 final; `LAUNCHER_RENDERER=vue pnpm build` y Playwright con EXE Vue, 03/45/55/58. El workflow incorpora 57 React y 58 Vue.

CI **[40992091527](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40992091527)** / `ace529909862184acb59ab917dad4a6497d616ba` aprobó ambos jobs del bloque anterior de información/grupos: 939 unitarias por job, **151 React + 1 cliente estricto + 5 Vue**, dos proveedores vivos omitidos. No equivale a CI aprobado para estos cambios de compartidos; consultar el run del próximo push.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-shader-sharing-manifest.json`, SHA-256 `b4f734e37044da797d7bc83855d1311eee7a56c1bdc40218a68832b50cdd747f`: 14 blobs Git canónicos y 220 artefactos, incluidos ambos EXE/ASAR, tipos/lint, fallo unitario inicial, regresiones, fallo visual previo, capturas/Axe y CI anterior. Solo se recorrieron directorios propios explícitos; no `sharing-temp-alias` ni las rutas de limpieza protegidas.

## Continuidad

Próximo: actualizaciones de shaders mediante el instalador revisado existente y proveedores públicos. Extender dominio/snapshots/manifiestos/recuperación/backups; conservar nombres y configuraciones, comprobar el motor/versión sin prometer compatibilidad GPU y mantener CurseForge detrás del proxy. No añadir una instalación directa desde renderer para evitar esas guardas.

Después mundos, ajustes y consola; catálogo 6, superficies 7, retirada 8 y validación/publicación 9. K08/K09/K10 y las tres gates 5 permanecen pendientes. PR4 sigue borrador y producción/proxy intactos; Microsoft pospuesto. Fixtures sintéticas: no se ejecutó Minecraft/shaders/Java real ni NSIS/delta aislado, y faltan los presupuestos finales.
