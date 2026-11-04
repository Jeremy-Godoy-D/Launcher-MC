# Etapa 5 parcial — aplicación Native de actualizaciones revisadas

Fuente `5bddad9edee90cddced7474386a039d519dc5827`. Etapa 5 y K08 siguen pendientes de la integración React y el resto de funciones.

La instalación local acepta una revisión opcional con el fingerprint de inventario/configuración y la lista exacta de rutas y operaciones de la vista previa. Native valida ambos bajo su lock, comprueba los hashes seleccionados y captura sus propias condiciones de archivo/configuración, sin aceptar esos campos internos del cliente. La condición queda en el perfil para reanudar. Antes de preparar y publicar/retirar comprueba los archivos revisados y Java/runtime/version; si cambian, falla con ModFilesChangedError y conserva archivos/progreso. El flujo anterior sin review permanece compatible.

La reanudación reconoce bytes ya publicados que coinciden con el contenido deseado incluso si falta su marcador de progreso; rechaza bytes publicados después editados. Una recuperación tras retiradas finales reconoce el estado deseado. No exige que el fingerprint inicial siga idéntico después de nuestros propios cambios ni revalida todo el directorio por cada escritura. Los renombrados de solo mayúsculas conservan los nuevos bytes en Windows.

Vista previa y aplicación comparten el constructor del plan local y la transferencia de nombres anteriores de proyectos pendientes. Así, la revisión muestra los archivos que realmente se retirarán y conserva otros proyectos pendientes. applyInstanceInstallManifest acepta una revisión nueva al confirmar; stage solo prepara metadatos, no sustituye la confirmación. No se anida otro lock de instancia.

## Evidencia

- 727 unitarias en 79 archivos, 19,17 s; diez casos nuevos de revisión. Focales:83 en tres archivos. Tipos raíz y lint aprobados; e2e tsc mantiene 56 errores previos, ninguno en 39.
- Nuevo spec 39: cuatro casos en ejecutable real, 10,7 s. Sustitución desactivada, configuración obsoleta y dos descargas HTTP de un servidor loopback propio, detenidas hasta modificar un JAR válido o la configuración. Se llama al servicio real y se comprueba que preserve los bytes; no se reemplazó el instalador con un mock.
- Otros 16 recorridos React (14/24/38), 42,3 s; tres Vue (03/08/33), 22,3 s. Total 23 escenarios empaquetados. Ambos renderers/hosts reconstruidos; dist/default Vue restaurados. Harness: nueve pruebas.
- 10 auditorías Axe existentes, 0 violaciones/24 incomplete; 19 capturas. Sin nuevo diseño ni calibración; no AA manual completo. CI [40723599113](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40723599113) aprobó React y Vue para 690eaae/0ae267c; esta fuente requiere CI propio.

Dos pruebas de E/S excedieron sus presupuestos anteriores bajo la batería completa. Solo esas dos ahora permiten 15 s; se conserva la publicación comprobada en 3 s desde que empieza la descarga y la prueba exige dos descargas paralelas antes de soltarlas. La fixture concurrente espera también las promesas si falla la espera, evitando errores sin manejar durante limpieza. La primera fixture del lock usaba texto no JSON: se corrigió a un lock válido y se sigue comprobando su conservación exacta. Los fallos diagnósticos quedan retenidos.

Comandos desde launcher: lista explícita de vitest del workflow, focales files_handler/progressive/concurrent; pnpm check; pnpm lint; pnpm --dir e2e exec tsc --noEmit; build:renderer y build del host por renderer; Playwright con el EXE respectivo y specs citados. Desde raíz: status/check y pruebas del harness.

Manifiesto ignorado con fuentes Git, logs, artefactos y hashes de cuatro binarios al capturarlos: launcher/e2e/artifacts/stage5-reviewed-upgrades-artifact-manifest.json. SHA-256 `4f369a0cf3653ebcc199a56080ac36c50f0d7604205a824695113d4419cb1eb5`. Los outputs de paquetes son mutables. Permanecen advertencias GPU/Buffer/build previas.

## Continuación y límites

Conectar consulta, selección y revisión de updates en React con review.snapshot/changes. Un fallo mantiene la selección y requiere revisar de nuevo los cambios ajenos. Resolver también recuperación tras reinicio/navegación sin perder el plan pendiente ni aplicar toda cola sin revisión. Después packs/shaders, mundos, ajustes, consola y 6–9. Los preflights no son una transacción del FS ni certifican compatibilidad de mods, invariancia de archivos ajenos al plan, rollback total o cortes eléctricos. Las pruebas HTTP son locales; no certifican descarga real de proveedores ni Java/juego/NSIS/delta. Producción/proxy intactos y Microsoft pospuesto.

Documentación oficial consultada para la siguiente integración: [CurseForge REST](https://docs.curseforge.com/rest-api/) limita pageSize a 50 e index+pageSize a 10000; el Worker refleja esos límites y configura 60 solicitudes/minuto por cliente. [Modrinth](https://docs.modrinth.com/api/operations/getlatestversionsfromhashes/) ya documenta version_types en la consulta por hashes. El cliente instalado aún no expone ese filtro: ampliarlo de forma opcional con pruebas al usarlo. No copiar extras ni claves a React.

No tocar ANALISIS_ARQUITECTURA.md ni reintentar las limpiezas denegadas de launcher-update-6nFkM2 o .progressive-install-test-s7GPKa.
