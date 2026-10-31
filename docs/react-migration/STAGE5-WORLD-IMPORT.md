# Etapa 5: importaci?n revisada de mundos desde carpeta y archivo ZIP

Fuente `46a3771ec538bd576cf07cb6dcf549420753609e`. React ya importa mundos desde una carpeta externa o un archivo `.zip` hacia `saves/<nombre>`, exigiendo revisi?n Native previa y confirmaci?n expl?cita, creando una copia independiente sin modificar el origen y respetando los bloqueos de instancia/partida activa. K11 y las gates de la etapa 5 permanecen `pending`.

## Contrato y garant?as

- `previewWorldFiles` y `applyWorldFiles` incorporan la variante `type: "import"` (`sourcePath`, `saveName`, `instancePath`). Al confirmar se vuelve a inspeccionar el origen y se exige coincidencia exacta con la huella (`fingerprint`) revisada; los datos enviados por el renderer no omiten controles ni autorizan rutas.
- Carpeta externa: se valida como directorio real sin seguir symlinks, se rechaza cualquier ruta dentro del destino y se inspecciona con `readFolderSnapshot` (profundidad 64, hasta 100000 entradas y 2 GiB acumulados), exigiendo `level.dat` legible en la ra?z (`readWorldPreview`) y copiando todos los archivos y carpetas vac?as con `level.dat` al final.
- Archivo `.zip`: `worldArchive.ts` inspecciona y extrae entradas validando rutas relativas seguras (sin rutas absolutas, `..`, unidad/UNC, NUL, nombres reservados de Windows, enlaces simb?licos Unix ni colisiones por may?sculas/min?sculas), acotando a 64 niveles, 100000 entradas y 2 GiB descomprimidos, admitiendo un prefijo com?n ?nico cuando el archivo envuelve la carpeta ra?z del mundo y verificando tama?o, CRC-32 y SHA-256 en streaming antes de publicar `level.dat` al final.
- Guardas de procesos y compartidos: se comprueba y revalida que la instancia destino no tenga partida activa (resolviendo tambi?n alias/junctions con `isSamePhysicalDirectory`), y cuando `saves` est? vinculada al dep?sito compartido global se avisa en la revisi?n y se bloquea si cualquier instancia tiene una partida en ejecuci?n.
- Si la copia o extracci?n falla a mitad de operaci?n, se conserva el origen intacto y el destino parcial se identifica para inspecci?n manual sin afirmar reanudaci?n autom?tica.

## Evidencia y verificaci?n

- CI remoto **41211315936 / 2190a82**: ambos jobs `renderer (react)` y `renderer (vue)` terminaron en **success** (999 pruebas unitarias + 9 del harness por job; React E2E **168 passed / 2 skipped / 0 flaky** en 12,7 min + Strict Mode **1 passed**; Vue E2E **8 passed** en 51,9 s), confirmando en GitHub Actions las correcciones de foco y sincronizaci?n registradas en `STAGE5-CI-STABILITY.md`.
- Suite unitaria completa del workflow (`.github/workflows/react-migration.yml` actualizado con `InstanceSavesService.files.test.ts` y `worldOperations.test.ts`): **1024 pruebas / 101 archivos**, 34,26 s (`launcher/e2e/artifacts/stage5-world-import-units-release.log`). Incluye los nuevos casos de importaci?n de carpeta/ZIP, enlaces simb?licos, alias de directorio con partida activa, colisiones, CRC-32/l?mites y conservaci?n de archivos.
- `pnpm check` (**0 errores**), `pnpm lint` (**0 errores**, 1 aviso previo en `queryModUpdates.ts`), `node --test scripts/react-migration.test.mjs` (**9/9**) y `pnpm --dir e2e exec tsc --noEmit` (**56 diagn?sticos previos**, 0 nuevos).
- React empaquetado (`xmcl-electron-app/build/output/react/win-unpacked/Grimo Launcher.exe`): **10 escenarios distintos** en `61-world-information.spec.ts`, `62-world-operations.spec.ts` y `64-world-import.spec.ts`, **10 passed** en 35,4 s (`--retries=0`).
- Vue empaquetado (`xmcl-electron-app/build/output/win-unpacked/Grimo Launcher.exe`, host/dist Vue restaurado): **2 escenarios** en `03-vue-compatibility.spec.ts` y `63-vue-world-files.spec.ts`, **2 passed** en 7,7 s.
- Accesibilidad Axe en los 4 estados nuevos de importaci?n (claro/oscuro, 1200?720 y 800?400): **0 violaciones / 8 incompletos** (2 por estado debidos al fondo con imagen tras el di?logo). No sustituye una auditor?a manual WCAG AA completa.
- Manifiesto ignorado `launcher/e2e/artifacts/stage5-world-import-manifest.json`, SHA-256 `a18b9ccb7847eb280fed4365ab8855077f118968e67ce7752df043ea7237734b`: 15 blobs Git can?nicos y 65 artefactos de validaci?n.

## Pendiente

Editar metadatos de mundos, gestionar datapacks y portar todas las herramientas locales confirmadas en `SCOPE.md` (visor de mapa, avances/progreso, dimensiones, regiones y consultar/copiar/pegar/eliminar/editar chunks con aislamiento, confirmaci?n y respaldo); despu?s resumen/ajustes base de instancia (`K07`, `K12`, `K13`), consola aislada por instancia (`K21`, gate `console-isolation`) y etapas 6?9.
