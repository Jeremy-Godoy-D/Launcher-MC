# Etapa 5 — identidades exactas de archivos de Mundos

K11 continúa pendiente. Se corrige la precisión de las comprobaciones de archivos; se conservan todas las herramientas locales y la edición de chunks autorizadas por el usuario.

`a3b4ba8a9115a6afbd52760efb41e6d90d436f6e` usa BigInt en lecturas acotadas, mundos, operaciones revisadas, regiones, ZIP/datapacks, progreso y snapshots compartidos de packs/shaders. Se comparan ino/dev y tiempos de nanosegundos sin redondearlos. Las identidades que se incluyen en huellas/cachés se normalizan a cadenas antes de serializar JSON. Los tamaños/fechas de presentación mantienen su contrato numérico; las asignaciones de memoria siguen limitadas por el presupuesto validado. Las revisiones en memoria anteriores pueden quedar obsoletas y requieren una nueva revisión; no cambia el formato persistido de mundos, backups ni preferencias.

`a41faf8cacafc33ae8d66d9f9bda0ccabc13f3d5` completa la autoridad del depósito compartido en InstanceSavesService y corrige la comparación de inodos de la fixture de shaders. No cambia la lógica de sus operaciones.

## Evidencia

- Focal inicial: **65/8 archivos**, 3,06 s. Siete regresiones nuevas reproducen IDs adyacentes mayores de 2^53, sustitución entre path/handle o al terminar la lectura, cambios dentro del mismo milisegundo y presupuestos inválidos. Comprueban cierre del handle y huellas distintas sin BigInt crudo en JSON.
- Suite seleccionada del workflow, cuatro workers: **1.271/127 archivos**, 28,43 s, antes de los dos ajustes finales de depósito/fixture. Después: **54/5 archivos**, 4,91 s, incluyendo los servicios de Mundos/chunks, progreso y snapshots. Runtime y DeskGap con tipos aprobados; lint sin errores y mismo aviso previo de queryModUpdates. No se añaden dependencias.
- React empaquetado a3b4ba8: **39/39 recorridos, 2,5 min**, un worker/cero reintentos: specs48/57/58/61/62/64/65/66/67/70/71/72/73. Incluye importación, copia/exportación, metadatos/datapacks, compartir packs/shaders, mapa/progreso, revisión/restauración de chunks y sesiones Java externas. Spec58 valida el contrato legacy desde ese host; su nombre no implica ejecutar Vue. **69 Axe, cero violaciones/126 incomplete**; límites de accesibilidad ya conocidos, sin certificación AA. Nueve avisos Buffer deprecated y cero errores de handlers/GPU en ese grupo.
- Al comprobar a41faf8, **11 arranques fallaron antes de ejecutar los escenarios**, código Windows 0xc000007b. Se conservan logs y hash del EXE fallido. Reempaquetar el mismo código resolvió el arranque: spec58 **1/1, 2,7 s**. No se atribuye una causa definitiva; debe comprobarse cada artefacto de entrega. Ese arranque exitoso registró dos avisos GPU al cerrar.
- Reempaquetado a41faf8: specs61/67/70, **10/10, 38,1 s**, sin cambios de código entre el arranque fallido y esta repetición. Veinte Axe, cero violaciones/32 incomplete; cero errores de handlers, Buffer deprecated o GPU en este grupo. No contar estas repeticiones como escenarios nuevos.
- Vue a41faf8: specs03/45/58/63, **4/4, 15,4 s**, contratos de compatibilidad de packs/shaders/mundos. DeskGap compila en producción; no se ejecuta funcionalmente ese host. Dist queda Vue y los paquetes permanecen separados. Ningún build corrió a la vez que Native.

Comandos desde launcher: checks focales de runtime/DeskGap, `pnpm lint`, Vitest con selectors del workflow y `--maxWorkers=4 --reporter=dot`; `LAUNCHER_RENDERER=react|vue pnpm --prefix xmcl-electron-app build`; Playwright con XMCL_E2E_EXECUTABLE del paquete, locale es-ES, un worker y cero reintentos; en la repetición focal `--max-failures=1`. Se reutilizan renderers ya compilados sin cambios de UI. DeskGap build en producción; tests/check del harness desde raíz. No DevTools/CDP ni interceptación de spawn; las sesiones externas utilizan la fixture Java autorizada, no Minecraft.

`launcher/e2e/artifacts/stage5-world-identities-manifest.json`, ignorado, SHA-256 `41ded2ec9e1621e0fecd5a8d9b9ed713eb21d6123cc08bd87938bf0ca2dd79e7`: 14 fuentes canónicas y 426 artefactos, incluidas identidades, fallos de arranque, logs y capturas propias. Nueve tests del harness aprobados; check de integridad al cerrar.

## Siguiente trabajo

No repetir esta conversión ni las pruebas amplias sin nuevos cambios. Falta cerrar K11: revisar llamadas/escritores legacy de InstanceSavesService (cloneSave, deleteSave, shareSave, updateSave, importSave/exportSave, enlaces globales e importación/retirada de datapacks), sus consumidores de creación/catálogos, validación de destinos/instancias, conservación de datos y bloqueo ante escritores que ignoren NIO. Reutilizar preview/apply/guardas existentes cuando respeten los contratos y el orden de locks; no envolver un método que ya sostenga el mismo mutex. Los métodos Native revisados tienen sus propias garantías; este bloque no certifica los writers legacy.

K12/K21 pasan; etapas6–9 pendientes. Microsoft pospuesto, PR4 borrador, producción beta.2/proxy sin cambios. Se mantienen excluidos DOMPurify WIP y ANALISIS_ARQUITECTURA.md. Juego real, auditoría integral, rendimiento final e instalador/delta aislados siguen pendientes antes de publicar.

La creación React todavía llama linkSharedSave en features/library/AddInstance.tsx. Preservar ese contrato y sus preferencias al resolver los métodos legacy; no deshabilitarlos indiscriminadamente. El despacho IPC compartido se encuentra en xmcl-runtime/service/pluginServicesHandler.ts; su auditoría global corresponde también a etapa8. CI41336065433/12a1125 estaba in_progress al cerrar esta evidencia; no se presenta como resultado del código a41faf8.
