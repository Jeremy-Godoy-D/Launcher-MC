# Etapa 5: gestión revisada de datapacks de mundos

Fuente `15810a63531d3000498b918bab94da39ee5aabb3`. React ya permite inspeccionar, listar, importar y retirar datapacks en formato `.zip` o directorio por mundo dentro del espacio de instancia, con validación de metadatos (`pack.mcmeta`), extracción de icono (`pack.png`), soporte de sidecars (`.modrinth`, `.curseforge`), advertencias de mundos compartidos, bloqueos por partida activa y respaldo previo en retirada. `K11` y las puertas de la etapa 5 permanecen `pending`.

## Contrato y conservación

- `InstanceDatapack` extiende la API con los atributos opcionales `directory?: boolean`, `size?: number`, `entries?: number` y `error?: 'invalid' | 'unsafe'`.
- `getWorldDatapacks(instancePath, saveName)` lee el directorio `<world>/datapacks/` de la partida, parsea `pack.mcmeta` acotando la lectura a 256 KiB, extrae y aplana componentes de texto (`text`, `extra`, `translate`), limpia secuencias de formato Minecraft `§[0-9a-fk-or]`, valida formatos numéricos o rangos `supported_formats` / `min_inclusive`, extrae iconos mediante `pack.png` a data URL segura y detecta junctions, enlaces simbólicos y anomalías sin abortar la lectura del resto de paquetes.
- `WorldFileOperation` incorpora las variantes discriminadas `{ type: 'import-datapack', sourcePath, fileName? }` y `{ type: 'remove-datapack', fileName }` en `previewWorldFiles` y `applyWorldFiles`.
- La importación verifica la existencia de `level.dat`, inspecciona el paquete origen (límite de 512 MiB comprimido y 2 GiB descomprimido para ZIPs, comprobación de CRC-32 y banderas de permisos), previene colisiones de nombre existente (`WorldDestinationExistsError`) y escribe mediante archivo temporal exclusivo o instalación atómica de carpetas (`assertInstallDirectory`).
- La retirada de datapacks traslada de manera segura tanto el archivo o carpeta del datapack como sus metadatos sidecar asociados (`.<fileName>.curseforge` y `.<fileName>.modrinth`) al directorio de seguridad `.backups/world-datapacks-<uuid>/<saveName>/`.
- La operación comprueba que `level.dat` no haya sufrido modificaciones concurrentes (`WorldFilesChangedError`) y bloquea cualquier cambio si la instancia está en ejecución (`InstanceRunningError`, incluidos alias de ruta) o si el mundo es compartido y está en uso por cualquier otra instancia (`SharedWorldRunningError`).
- `InstanceWorlds` incorpora la sección `Datapacks` por mundo (`data-testid="world-datapacks"`), mostrando iconos, nombre, formato, descripción formateada, estados de error y botones de acción para importar (`data-testid="datapack-import"`) y retirar (`data-testid="datapack-remove"`). `WorldFilesDialog` presenta el diálogo de revisión con advertencias explícitas en mundos compartidos y selección de archivos ZIP o carpetas.

## Validación

- Suite unitaria: **4 pruebas** en `worldDatapacks.test.ts` (parseo de `pack.mcmeta`, inspección de archivos ZIP y directorios, lectura resiliente con paquetes inválidos y preservación de sidecars), **20 pruebas** en `worldFiles.test.ts` y `worldOperations.test.ts`, y más de 1027 pruebas del proyecto en verde.
- `pnpm check` y `pnpm lint` aprobados en los 6 paquetes del monorepositorio con **0 errores y 0 avisos** en `xmcl-runtime`; `pnpm --dir e2e exec tsc --noEmit` conserva exactamente los **56 diagnósticos previos**.
- Paquete empaquetado React (`xmcl-electron-app/build/output/react/win-unpacked/Grimo Launcher.exe`): **16 escenarios** (`61`, `62`, `64`, `65` y `66-world-datapacks.spec.ts`) aprobados en 52,7 s con `--retries=0`.
- Paquete Vue (`xmcl-electron-app/build/output/win-unpacked/Grimo Launcher.exe`): **2 escenarios** (`03` y `63`) aprobados en 7,5 s con `--retries=0`. Renderer por defecto conservado en Vue.
- Accesibilidad Axe en los **4 estados nuevos** de revisión de datapacks (`datapack-dark-1200`, `datapack-dark-800`, `datapack-light-1200`, `datapack-light-800`): **0 violaciones / 2 incompletos** (fondo de ventana).
- Manifiesto ignorado `launcher/e2e/artifacts/stage5-world-datapacks-manifest.json`: SHA-256 `3640c1a08488b0ddbe2321f7d99e414f9adbd64e196e48827cb506324404f573`, **14 blobs Git canónicos** y **78 artefactos**.

## Pendiente

Completar el bloque C de la etapa 5 con todas las herramientas locales de mundos confirmadas por el usuario en `SCOPE.md` (`K11`):
1. Visor de progreso de partida (avances, misiones y estadísticas locales).
2. Visor interactivo de mapa de mundo (dimensiones, regiones y visor de chunks).
3. Operaciones sobre chunks: inspección de datos NBT, copia, pegado/reubicación y eliminación con aislamiento estricto, confirmación revisada, bloqueos por juego en ejecución y respaldo de regiones antes de aplicar cambios.

Posteriormente se abordará el resumen de instancia (`K07`), los ajustes base de Java y ejecución (`K12`, `K13`), la consola de procesos con aislamiento (`K21`) y las etapas 6 a 9.
