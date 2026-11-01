# CI: commits de chunks y limpieza de la fixture

Fuente `1d3c9b4ee5caa8987218d7f6c4285763ca360323`. Cambia solo InstanceSavesService.chunks.test.ts; no altera la implementación, fsync, bloqueos, respaldos ni formatos del producto. Todas las herramientas locales de Mundos permanecen en alcance.

[CI 41305967989 /a31a7f1](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41305967989) pasó tipos/lint y falló en unitarias: 1.156/1.157, 115/116 archivos, 39,94 s. La prueba de pasteSaveChunks con respaldo duradero alcanzó el timeout de cinco segundos. La limpieza encontró ENOTEMPTY en su directorio de backup; la operación no queda cancelada al vencer el timeout de Vitest. Vue se canceló por fail-fast y no hubo recorrido Native: este CI no verifica aún la corrección de foco de 72.

El recorrido usa dos planes secuenciales, regiones acotadas y mutex de fixture sin juego activo. applySaveChunkPlan hace respaldos, archivos preparados y manifiesto con escrituras/sync/rename reales. No se encontró un ciclo de espera en ese camino; el timeout observado no demuestra por sí solo un bloqueo lógico ni fija un requisito de latencia del producto. Se ajustó a 30 segundos solo el presupuesto de los tres casos que confirman commits duraderos (incluido alias), sin cambiar configuración global ni añadir reintentos.

Esos tres casos registran su promesa. afterEach captura primero la raíz y espera esa operación antes de verificar y retirar la carpeta temporal propia. El catch sirve para esperar la limpieza; no cambia el fallo de la prueba ni sus aserciones. Se refuerzan los dos casos principales consultando la API pública de backups y exigiendo state=complete además de los chunks/nombres esperados. No se reintenta ninguna limpieza denegada del workspace.

## Evidencia

Manifiesto ignorado `launcher/e2e/artifacts/stage5-ci-chunks-timing-manifest.json`, SHA-256 `6174081dd931986ae8602a0ecb3d8912e083a7219d8442a193aa36f0e2cbfb59`: una fuente Git canónica y siete artefactos (CI anterior, focales, suite, tipos/lint/harness). Check posterior al informe fuera del manifiesto.

- Focal inicial: 25/25 en dos archivos, 3,69 s. Suite completa del workflow sin builds/tipos/Electron concurrentes: **1.157/1.157, 116 archivos**, 27,09 s. Esa ejecución precede el registro/presupuesto del tercer caso con alias; después se repiten los 25 focales, **25/25**, 3,44 s. No se cuentan como pruebas nuevas.
- Check de xmcl-runtime aprobado; lint sin errores ni avisos. Nueve pruebas y check del harness. No se reconstruyen paquetes ni se repiten interfaces por un cambio exclusivo de fixture. Dist Vue y la validación Native del bloque 78642d0 permanecen.
- Comandos desde launcher: Vitest con InstanceSavesService.chunks.test.ts/worldChunks.test.ts y lista completa de .github/workflows/react-migration.yml; --prefix xmcl-runtime check/lint. Desde raíz, tests/check de react-migration. Los logs permanecen ignorados.

Verificar el nuevo CI exacto; no considerar corregida remotamente la calibración ni el foco de 72 por los resultados locales. K11/K21 y etapa 5 siguen pendientes. K12 pass; etapas 6–9 pendientes; PR 4 borrador; producción/proxy intactos y Microsoft pospuesto. Los presupuestos de prueba no son límites de duración ni cancelación de operaciones de usuarios.

## Instalador aislado: alternativa disponible para la etapa 9

El repositorio es público (gh repo view) y su workflow ya usa windows-latest. GitHub documenta que ese runner estándar usa una VM nueva por job y que los runners estándar son gratuitos para repositorios públicos. Es una alternativa para implementar las pruebas NSIS/delta en un job separado antes de volver a solicitar una VM local. No constituye todavía una prueba del instalador ni sustituye la validación de juego/GPU del equipo de referencia. [Documentación oficial de runners](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).
