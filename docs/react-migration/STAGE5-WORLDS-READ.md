# Etapa 5: lectura e información de mundos

Fuente `a2bf0326022ee8f37f7312d4caa3a466a81f5790`. La pestaña Mundos de React ya lee los mundos reales de la instancia, permite buscar por nombre/versión y consultar nombre de carpeta, modo, dificultad, trucos, última partida, días y semilla. No se declara K11 ni etapa 5 terminados.

## Implementación y seguridad

- Getter Native exige instancia Java registrada y revalida tras adquirir el lock. API de estado Vue sin cambios; el getter conserva los campos de cabecera anteriores.
- Solo se aceptan carpetas locales y enlaces hacia el depósito propio del launcher, incluida la carpeta completa compartida. Un enlace externo genera una fila de error sin leer su destino.
- Se conservan filas con `level.dat` ilegible. Lectura acotada: 1000 entradas, archivo 4 MiB, expansión 16 MiB, profundidad NBT 64, colecciones 100000 y 200000 nodos. La validación precede a las asignaciones del decodificador compartido; rechaza conteos falsos y claves `__proto__`.
- Iconos copiados como PNG estático en data URI: 64 KiB y dimensiones hasta 512px, sin enlaces ni APNG. No se usa el protocolo de medios con una ruta arbitraria.
- Refresco inicial, manual y al recuperar foco, sin temporizador ni solicitudes simultáneas dentro de la suscripción. Resultados tardíos se ignoran al desmontar/cambiar instancia. Durante una partida propia la lista espera su cierre. Panel con Escape y devolución de foco.
- La lectura no escribe archivos de mundos. La inicialización histórica del servicio conserva su migración/limpieza anterior; no se afirma que todo el servicio sea puro ni que sus métodos de escritura heredados estén auditados.

## Validación

- Suite del workflow: **989 pruebas / 98 archivos**, 19,92 s, sin build/Electron simultáneos. Las seis pruebas del nuevo lector incluyen enlaces, NBT corrupto/expandido/conteos/nesting, iconos, fechas y conservación de bytes/mtime.
- `pnpm check` y `pnpm lint` completos aprobados. Tras la validación NBT: check/lint del runtime repetidos, cero avisos. Lint React conserva un aviso previo de regexp en actualizaciones de shaders.
- E2E `tsc --noEmit`: mismos 56 diagnósticos previos (47 únicos al normalizar líneas), sin nuevos.
- React empaquetado: **11 escenarios** (02/52/61), 35,4 s. Los **3 nuevos** de 61 se repitieron tras el último ajuste NBT y pasaron en 8,8 s. No sumar repeticiones como escenarios nuevos.
- Vue 03 pasó antes y después del último build; última repetición 5,5 s. Ambos hosts construidos; renderer Vue existente reutilizado, dist/default restaurados a Vue.
- Cuatro estados nuevos de Axe: claro/oscuro en 1200×720 y 800×400, **0 violaciones / 4 incompletos**; los cuatro se repitieron sobre el último binario. Capturas revisadas manualmente: oscuro 800 y claro 1200. Sin desbordamiento horizontal y foco de cierre accesible. No certifica AA manual completa.
- CI anterior **41177249288 / 413a55d: success en ambos jobs**. CI del nuevo push pendiente.

Comandos desde `launcher`: lista `pnpm exec vitest run` del workflow, `pnpm check`, `pnpm lint`, `pnpm --dir e2e exec tsc --noEmit`; `LAUNCHER_RENDERER=react` con `gen:testids`, `build:renderer`, `build`; Playwright EXE React 02/52/61 y repetición 61; `LAUNCHER_RENDERER=vue pnpm build` y EXE Vue 03. Logs/capturas ignorados conservados en `e2e/artifacts/stage5-worlds-read-*`.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-worlds-read-manifest.json`: SHA-256 `5c8fe3c6ecf95b521a4401fd5a7abb08e8c53d36521dc85bac9dcbc64d7c0d89`, 14 blobs Git canónicos y 92 artefactos. Recorrido restringido a carpetas propias explícitas, sin seguir rutas protegidas.

## Siguiente bloque y límites

Implementar operaciones de mundos y datapacks con revisión, confirmación y conservación de archivos; después ajustes de instancia y consola. No conectar directamente los métodos de escritura heredados sin revisar sus destinos, enlaces y colisiones. La pregunta opcional sobre mapa/progreso/editor de regiones sigue pendiente; no retirar esas herramientas por suposición.

Fixture local y metadatos NBT sintéticos, IPC/lector reales. No hubo partida real, NSIS/actualización aislada, medición de rendimiento ni publicación. Producción/proxy intactos, PR4 en borrador y Microsoft pospuesto.
