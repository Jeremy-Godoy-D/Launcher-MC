# Etapa 5 reabierta: autoridad de chunks y corrección de la validación

Fuente `55e14813e545c094080b6b9f02aa25fc3cf08fef`, posterior a `9733529`. Este informe corrige el cierre prematuro de la etapa 5. La implementación local de mapa, ajustes y consola existe, pero sus criterios completos siguen pendientes. No habilita la etapa 6 ni una publicación.

## Fallo demostrado y cambio

El [CI 41264504836](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41264504836), sobre `9733529`, terminó con **1035/1037** pruebas unitarias en Vue: eliminar y pegar chunks no rechazaban la instancia activa. React fue cancelado por el fallo de la matriz. La comparación mezclaba la ruta registrada con `realpath` del mundo; en Windows los alias del directorio temporal podían impedir reconocer su instancia.

- La autoridad de escritura ahora se deriva de instancias Java registradas o del depósito compartido propio. Reutiliza `worldLocation`, `readBoundedFile` y `assertInstallDirectory`. Un `level.dat` en cualquier otra carpeta no autoriza modificarla.
- Se comparan las rutas físicas de registro y proceso. La consulta de procesos falla cerrada; un error no se convierte en «ninguna partida activa».
- Las escrituras comparten el bloqueo global de operaciones de contenido y el bloqueo de instancia. Se vuelve a comprobar registro, identidad y procesos después de esperar y después de respaldar.
- Se rechazan dimensiones con rutas inválidas, coordenadas u offsets fuera de enteros de 32 bits, duplicados, más de 4096 chunks, compresiones fuera de 1/2/3 y payloads que excedan el formato inline o 64 MiB por operación.
- Antes de mutar regiones se rechazan directorios enlazados y archivos irregulares/enlazados o mayores de 256 MiB. El respaldo usa creación exclusiva, compara SHA-256 de origen/copia y vuelve a comprobar identidad, tamaño y fechas del origen. Un error de lectura o respaldo detiene la operación.

El resumen nuevo también introdujo accesos a Mods/Mundos con el mismo nombre que las pestañas. Se acotaron **21 localizadores** de las pruebas de migración a la navegación «Secciones de la instancia». Se conservan ambos accesos de producto y todas las aserciones funcionales. No se modificaron suites canónicas protegidas.

## Verificación realizada

Manifiesto ignorado: `launcher/e2e/artifacts/stage5-chunk-safety-manifest.json`, SHA-256 `fda344c3e54e8e469c06db96bc62d4b031daa01887fc483b8df599c0de714593`: identifica **21 archivos fuente canónicos y 47 artefactos**, incluidos logs, 12 capturas, informes Axe y hashes de ambos ASAR.

- Regresiones nuevas antes del arreglo: **5 fallos / 6 aprobadas**, incluidos alias físicos, mundo ajeno, consulta de procesos fallida y dimensiones/coordenadas inválidas. La suite de chunks queda en **14 aprobadas**; chunks + región: **21 aprobadas**.
- Suite exacta de la línea `pnpm exec vitest run ...` del workflow, ahora con `xmcl-runtime/save/region.test.ts`: **1052 pruebas / 104 archivos**, 24,36 s, sin ejecución concurrente de Electron o builds.
- `pnpm check`: aprobado en los seis paquetes. `pnpm lint`: cero errores y un aviso previo `no-control-regex` en `queryModUpdates.ts`. El chequeo TypeScript de E2E conserva exactamente **56 diagnósticos base**, sin añadir ni retirar diagnósticos tras normalizar coordenadas.
- React empaquetado: specs **31/32/34/35/36/37/40/42/61/62/64/65/66/67/68/69**, con `--retries=0`. El primer recorrido de mundos tuvo 19 fallos de localizadores y 8 aprobadas. Tras corregirlos, el recorrido amplio tuvo **59/61 aprobadas**; los dos fallos restantes eran matrices que intentaban reenfocar el mismo control tras redimensionar. Se corrigieron para confirmar el tamaño nativo y recorrer el foco con **Tab**. La repetición de 68/69 aprobó **7/7** (17,9 s), y 67, ampliado con copiar/eliminar/pegar/restaurar por IPC real, **4/4** (12,2 s). Son **61 escenarios distintos** cubiertos entre recorridos, con solapamientos; no una única ejecución de 61 íntegramente verde.
- El caso Native adicional rechaza un mundo ajeno, una dimensión con traversal y un depósito de backups enlazado, conserva sus sentinelas, comprueba el respaldo exacto de la región y restaura el payload del chunk sin cambios. No sustituye la prueba de una partida real.
- Matrices de mapa/ajustes/consola con apariencias persistidas y ventanas Electron reales **1200×720 / 800×400**: **12 informes Axe, 0 violaciones y 12 incompletos `color-contrast`**. Se verifican foco/scroll de Guardar y buscador mediante teclado. Capturas inspeccionadas; sigue pendiente la aceptación integral de estas superficies, incluido el mapa por teclado y la revisión de los incompletos.
- Vue: renderer/host reconstruidos y **2/2** pruebas 03/63 aprobadas (7,1 s). El log conserva avisos GPU de cierre; no se presentan como consola completamente limpia. Dist del host queda **Vue**; ambos paquetes permanecen separados.

Comandos reproducibles: `pnpm check`, `pnpm lint`, la línea Vitest del workflow, `pnpm --dir e2e exec tsc --noEmit`, `LAUNCHER_RENDERER=react|vue pnpm build:renderer` y `pnpm build`; Playwright se ejecutó con `XMCL_E2E_EXECUTABLE` apuntando al EXE correspondiente, `XMCL_E2E_LOCALES=es-ES`, `--retries=0` y las specs indicadas. Las salidas están identificadas en el manifiesto y los comandos en este informe/workflow. `node launcher/scripts/react-migration.mjs check` aprobó la integridad/orden/evidencias y `node --test launcher/scripts/react-migration.test.mjs` aprobó sus nueve regresiones; sus dos logs `stage5-chunk-safety-harness*-release.log` quedan ignorados fuera del manifiesto anterior.

Dos archivos de dependencias DOMPurify ya estaban modificados al retomar y continúan fuera del commit fuente; no se usaron para añadir HTML remoto a la interfaz. El CI nuevo debe comprobar la compilación desde checkout limpio. Este bloque no mide rendimiento, no ejecuta Java/NSIS/delta y no publica. No se tocaron datos habituales, proxy, Microsoft ni archivos protegidos.

## Criterios pendientes antes de cerrar 5

1. **K11, chunks:** revisión Native con huellas de las regiones y rechazo de cambios entre revisar/confirmar; autoridad y límites también en copiar/leer/renderizar; NBT y descompresión acotados; publicación/recuperación de regiones ante fallos de I/O y enlaces físicos. Auditar la reubicación: el código heredado advierte que entidades de bloque conservan coordenadas absolutas; no prometer que mover terreno preserve cofres y otros datos sin resolverlo.
2. **K11, mapa:** navegación y selección por teclado, cola de render acotada, claves por mundo/dimensión/altura, rechazo de resultados obsoletos y cierre/expulsión de `ImageBitmap`. El mapa actual no tiene estas garantías completas.
3. **K12, ajustes:** conservar argumentos existentes que contienen espacios/comillas (actualmente `join(' ')` + `split(/\s+/)` puede alterarlos al guardar), probar cambios sin guardar al navegar/cambiar instancia y la herencia real. La matriz simple de persistencia no acredita estos casos.
4. **K21, consola:** probar streaming de dos instancias/procesos por el transporte real, fragmentos parciales, eventos por lotes, historial virtualizado, pausa de seguimiento al hacer scroll, retorno al final y copiar/exportar con errores. Las pruebas actuales de archivos guardados y controles no acreditan esa aceptación completa.
5. Verificar el CI del commit nuevo y resolver sus fallos sin relajar aserciones. Mantener la etapa 5 activa, K11/K12/K21 pendientes y la etapa 6 pendiente. Después continuar catálogo/proveedores y las etapas 7–9 del plan aprobado.
