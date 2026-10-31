# Etapa 5 parcial — destinos de instalación y orden de solicitudes

Fuente: `9d6ad2b09a12e4aafda7ec482951b0be56c9e358`. Etapa 5 y K08 permanecen pendientes.

El instalador comprueba cada destino antes de leerlo, preparar staging y publicar o retirar archivos. Reutiliza `instanceFileSource`: el lector sigue siendo estricto por defecto y el instalador permite destinos aún ausentes. Solo acepta enlaces superiores a las carpetas compartidas que resuelve `kGameDataPath` (resourcepacks, shaderpacks y saves); rechaza enlaces externos, anidados y la sustitución de una carpeta por un archivo. Staging y backup comprueban sus ancestros y archivos individuales. El callback de publicación recibe el archivo, evitando revisar todo el pack por cada escritura; los lotes de progreso validan solo su selección.

Una descarga parcial inválida se desvincula antes de reemplazarla: si era un hardlink, conserva el recurso original. La fixture antigua de descarga ahora materializa sus bytes en vez de señalar como terminado un archivo eliminado. Un conflicto de directorio surgido tras preparar falla solo ese archivo, conservando los demás archivos listos y su reanudación; la prueba original conserva todas sus aserciones.

Las validaciones asíncronas revelaron una carrera que podía invertir solicitudes simultáneas del mismo mod. La reserva de orden ahora ocurre al entrar a `installInstanceFiles`, antes del primer await; libera la siguiente inicialización al registrar el plan y mantiene las descargas paralelas. La regresión fuerza una validación lenta en la primera solicitud y conserva la última versión solicitada; pasó tres ejecuciones independientes y la batería completa.

## Evidencia

- 709 pruebas unitarias en 77 archivos, 15,25 s. Ocho casos nuevos; 82 focales en cuatro archivos. Tipos raíz, comprobación final de runtime y lint aprobados.
- React empaquetado: 16 recorridos de los specs 14/24/38 en 32,0 s. Vue: 03/08/33, tres recorridos en 19,1 s. Ambos hosts reconstruidos; renderers compilados y main dist/default Vue restaurados.
- Diez auditorías Axe de los recorridos existentes: cero violaciones y 24 resultados incomplete; 19 capturas. No demuestra AA manual completo. E2E tsc conserva 56 errores previos, ninguno en el spec 38.
- Harness: nueve pruebas. CI anterior [40717537004](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40717537004), head 1da8953/fuente f25aab4, aprobó React y Vue. El commit actual necesita su propio CI tras push.

Comandos desde launcher: `pnpm check`; `pnpm --prefix=xmcl-runtime check`; `pnpm lint`; `pnpm exec vitest run` con la lista explícita del workflow; `pnpm build:renderer` y `pnpm --prefix=xmcl-electron-app build` por renderer; Playwright con XMCL_E2E_EXECUTABLE del paquete respectivo y specs citados; `pnpm --dir e2e exec tsc --noEmit`. Desde raíz: `node --test launcher/scripts/react-migration.test.mjs` y `node launcher/scripts/react-migration.mjs check`.

El manifiesto ignorado `launcher/e2e/artifacts/stage5-install-targets-artifact-manifest.json` identifica los blobs Git, logs —incluidos fallos diagnósticos—, capturas y cuatro binarios al capturarlos. SHA-256: `a10dae6cea5286f910392c508c00541bc787fc5aeea7f40834fd30aa385d3e02`. Los paths de paquetes son mutables. Se conservan advertencias GPU/Buffer/build previas; no se afirma ausencia universal de errores de consola.

## Límites y continuación

Los preflights lstat no son una transacción ni impiden toda carrera externa del FS. No hay rollback total o garantía ante corte eléctrico, nueva calibración ni prueba real de Java/juego/NSIS/delta. Microsoft pospuesto, producción y proxy intactos. No cerrar gates con este bloque parcial.

Siguiente: compartir buildModUpgradeManifest con React manteniendo el wrapper Vue y conservar .disabled; conectar consultas de actualizaciones, revisión, cola y validación nativa de hashes/configuración vigentes al publicar. Continuar packs/shaders, mundos, ajustes, consola y etapas 6–9. No anidar el lock de mods alrededor del instalador.

La revisión automática rechazó por política el borrado de la fixture `launcher/.progressive-install-test-s7GPKa`; queda conservada y no se debe reintentar su limpieza ni eludir el rechazo. No contiene una instalación de usuario y no forma parte de los paquetes.
