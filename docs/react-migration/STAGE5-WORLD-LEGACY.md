# Etapa 5 — escrituras legacy de Mundos, primer bloque

K11 sigue pendiente. Se conservan las herramientas locales y chunks; este bloque asegura cinco entradas legacy sin desactivar sus consumidores.

`2a1d8a1f328ef3324d321f174fc6b6b740df82f4` dirige cloneSave, deleteSave, updateSave, importDatapack y deleteDatapack al protocolo Native de revisión/aplicación, con identidad, guardas de sesión y respaldos existentes. La autorización para operar sobre el depósito fijo es privada: añadir argumentos por IPC no habilita esa excepción. Instancias desconocidas/Bedrock, rutas no portables, enlaces ajenos, cambios desde la revisión y partidas activas se rechazan.

La copia valida todos los destinos antes de empezar, no mezcla carpetas ocupadas y conserva archivos independientes; acepta hasta 1000 destinos y elimina duplicados. No es una transacción entre destinos: un fallo posterior puede dejar copias anteriores completas. El borrado retira al respaldo sin destruir el mundo; conserva el contrato idempotente cuando falta. Los metadatos parciales se combinan con los actuales, conservan campos desconocidos y admiten semilla cero; se rechaza una combinación obsoleta. Los datapacks conservan importación independiente y retiro con sidecars a respaldo, incluyendo el depósito compartido autorizado.

`316b39e0c59250aaed63f94a6d5f58f99c705ac4` corrige únicamente la fixture: Windows impide leer session.lock mientras Java lo mantiene bloqueado; se comprueban sus bytes después de liberar, manteniendo la aserción de integridad. `d343c1e1305e49ebe2b4699b6471ade6d40020d5` identifica como compartido el acceso directo al depósito, incluso si también está registrado como instancia, y añade su regresión.

## Validación

- Diez regresiones nuevas del servicio con filesystem real y una adicional de identificación del depósito. Grupo focal final: **62/6 archivos, 3,30 s**, cuatro workers. Runtime con tipos aprobados y lint sin errores; permanece el aviso previo de queryModUpdates. DeskGap también pasó tipos antes del ajuste de la bandera y compila en producción con el código final. E2E mantiene los 56 diagnósticos base, sin nuevos. No se añaden dependencias.
- React empaquetado 2a1d8a1: specs62/65/66/73/85; **15 pasaron, una falló por la lectura de session.lock y una no se ejecutó**. Tras corregir la fixture, spec85 **4/4, 7,0 s**: **17 escenarios distintos** entre los dos grupos, sin contar repeticiones. Las matrices conservan sus aserciones visuales/de accesibilidad; este bloque no cambia UI.
- Vue empaquetado antes del ajuste final del depósito: specs03/63/85, **6/6, 14,6 s**. Con d343c1e empaquetado de nuevo: spec85 **React 4/4, 6,7 s; Vue 4/4, 7,8 s**, un worker/cero reintentos. La prueba compartida mantiene una sesión real de la fixture Java NIO, no Minecraft. En la última invocación Vue los dos nombres adicionales no coincidían con archivos: solo se ejecutó spec85; no se presentan seis pruebas finales.
- Hay avisos GPU state invalid al cerrar ventanas en ambos hosts y tres Buffer deprecated en el primer grupo React; no se afirma consola global limpia ni causa resuelta de esos avisos. Las aserciones funcionales finales pasaron. No hay interceptación de spawn, DevTools/CDP ni acceso a perfiles habituales.
- Nueve pruebas del harness aprobadas y check de integridad al cerrar. Renderer/dist queda Vue, paquetes separados e identidades de main/ASAR/EXE conservadas antes de sobrescribir dist. Ningún build se ejecutó junto a Native.

Comandos desde launcher: pnpm exec vitest run con los seis selectors afectados y --maxWorkers=4; pnpm --prefix xmcl-runtime check; pnpm lint; LAUNCHER_RENDERER=react|vue pnpm --prefix xmcl-electron-app build; Playwright con el EXE empaquetado, locale es-ES, --workers=1 --retries=0 --max-failures=1; NODE_ENV=production pnpm --prefix deskgap-app build. Tests/check del harness desde raíz. Los logs enumeran comandos/selectors y resultados.

Manifest ignorado launcher/e2e/artifacts/stage5-world-legacy-manifest.json, SHA-256 `88c74c65a8c4b3be2081e9260aa9734b27e821599d2eb14ff4e5f1b172209676`: 6 fuentes Git canónicas y 181 artefactos propios, incluidos logs, capturas e identidades. Se excluyen reparse points y las salidas posteriores del check/PR.

CI41338119274 sobre c913135 terminó success: **234 React +1 Strict +14 Vue**, dos opt-in omitidos; confirma el bloque de identidades anterior, no estos cambios. CI nuevo pendiente tras push.

## Siguiente acción y límites

Asegurar importSave/exportSave/shareSave/linkSharedSave/unlinkSharedSave e instalación de datapacks desde mercados, conservar sus callers y revisar lectores/IPC legacy. Priorizar el extractor ZIP legacy: aún no reutiliza el importador acotado; preservar la semántica de enlace al habilitar mundos del depósito propio. AddInstance.tsx usa linkSharedSave, no negarlo indiscriminadamente. Completar escritores ajenos a NIO y aceptación integral antes de cerrar K11. Auditoría global IPC/extras también en etapa8.

K12/K21 pass; etapa5 activa y6–9 pendientes. Microsoft pospuesto, PR4 borrador, producción beta.2/proxy intactos. No se verifican juego real, DeskGap funcional, AA manual global, rendimiento final ni instalador/delta aislados en este bloque. DOMPurify WIP y ANALISIS_ARQUITECTURA.md permanecen excluidos.
