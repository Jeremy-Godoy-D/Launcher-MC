# Consola: identidad de solicitudes simultáneas

Fuente `4fff46920c5ee74f2bc0585100f4cfc2bb55b9a2`. Primer bloque de K21; etapa5 activa. Corrige una mezcla real de respuestas y operaciones, sin presentar la consola completa como terminada.

InstanceLogService usaba Singleton sin parámetros para listar, y solo el primer argumento para leer/eliminar. Dos listados de instancias distintas podían recibir la misma lista. Dos archivos distintos de una instancia podían devolver el mismo contenido o confirmar una eliminación que solo había retirado el primer archivo. Se reprodujo con tres regresiones unitarias y con el EXE anterior: el listado de beta.log devolvía alpha.log.

Los nueve métodos decorados reutilizan ahora ALL_PARAMS, existente en el framework. La clave incluye instancia y archivo; conserva la deduplicación de la misma solicitud y separa las distintas. No se cambia el decorador global, el contrato, la UI ni la ubicación de logs. La regresión recorre logs cliente, servidor y crash-reports; el recorrido Native comprueba listados/lecturas/eliminaciones reales y que la segunda instancia conserva sus bytes. Workflow incluye las pruebas nuevas en ambos renderers.

## Evidencia

Manifiesto ignorado `launcher/e2e/artifacts/stage5-console-isolation-manifest.json`, SHA-256 `57cdf325fa5d250a7e5337ddc24909f262a05a0e181e8b9c13cbddff7e7fdf7f`:4 fuentes canónicas y31 artefactos, con copias propias de main/ASAR/EXE React y Vue y capturas. No se versionan logs/binarios/capturas.

- Antes:3/3 unitarias fallaban; el spec76 sobre el paquete anterior también fallaba por el listado cruzado. Después:3/3 focales; suite completa del workflow independiente de builds/Electron: **1.142 pruebas/115 archivos**,24,29s.
- `pnpm check` aprobado en seis paquetes; `pnpm lint` sin errores y un aviso previo. E2E conserva56 diagnósticos base, sin nuevos/retirados al normalizar coordenadas.
- React empaquetado, specs69/76, es-ES, `--retries=0`: **5/5**,12,4s. Vue empaquetado,03/63/76: **3/3**,9,2s. Dist compartido restaurado Vue; los EXE permanecen independientes. La prueba76 depende de servicios/IPC, sin controles específicos de React.
- Matriz de consola con datos, claro/oscuro y1200×720/800×400:4 informes Axe sin violaciones/4 incomplete de contraste. No certificación manual de estados aún no migrados. Hubo dos avisos GPU de Chromium después de cerrar la última fixture React; las pruebas no fallaron por ellos. Rendimiento/driver final sigue en sus gates.
- Nueve tests ycheck del harness aprobados. Check posterior al informe fuera del manifiesto para evitar circularidad.

Comandos: Vitest focal InstanceLogService.files.test.ts y lista del workflow; pnpmcheck/lint; E2E tsc y comparación; builds renderer/host React y Vue; Playwright con XMCL_E2E_EXECUTABLE de cada EXE y los specs anteriores; tests/check del harness. Ejecutar pnpm desde launcher. Las pruebas de eliminación solo operan sobre temporales propios con raíz verificada.

## CI y aceptación

[CI41297391323 /0bc6c6f](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41297391323) terminó **success en ambos jobs**, con212 main,1 Strict y8 Vue aprobados,2 casos de proveedores opt-in omitidos y **ningún flaky**. Valida el cierre de herencia/contraste/ciclo beforeunload anterior y resuelve el seguimiento de74 de41294264006. **K12 pasa a pass**. Este verde previo no valida automáticamente el cambio de logs nuevo; consultar su SHA después del push sin reiniciar una ejecución viva.

K21 continúa pending: faltan autoridad/rangos de rutas y tamaños de archivos/gzip/historial, errores visibles, streaming por instancia/proceso, orden y fragmentos de decodificación, lotes, límites de memoria/virtualización, autoscroll al revisar y recuperación de copiar/exportar. No ampliar las garantías de esta corrección de deduplicación a toda operación de InstanceLogService. Native aún conserva lectores legacy y la UI anterior.

K11 conserva aceptación integral/auditoría IPC legacy/escritores noNIO; todas las herramientas locales de Mundos y chunks permanecen. Etapa5 activa;6–9 pendientes;PR4borrador;producción beta.2/proxy intactos,Microsoft pospuesto. Sin nuevas partidas Minecraft,NSIS/delta aislados ni presupuestos60s. WIP DOMPurify y ANALISIS_ARQUITECTURA.md fuera de los commits.
