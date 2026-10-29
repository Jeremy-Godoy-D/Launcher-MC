# Etapa 5 — packs durante arranque y salida

Fuente `b7ec02c11a3ebbde9b3c0f2437bb2c232b48ab49`. Resuelve la carrera registrada en RESOURCE-PACK-FILES; K08/K09 y los tres criterios de etapa 5 permanecen pendientes.

## Comportamiento

LaunchService usa el mismo orden de bloqueo que las mutaciones de packs: resource-pack-options y después la instancia. Los adquiere antes de preparar opciones/ejecutar middlewares y los libera después de registrar el proceso, antes del I/O del historial. También los libera ante errores y vuelve a comprobar el diario de copia bajo el bloqueo. Los comandos previos del usuario permanecen fuera para evitar reentrada. El punto común cubre clientes y servidores, independientemente del renderer.

Pedir detener un proceso conserva su registro hasta el evento real de salida; así las guardas no permiten cambiar archivos mientras Minecraft aún se está cerrando. Se evita duplicar la petición de cierre normal, se permite forzarla y un error síncrono al enviar la señal permite reintentar.

Se retiran dos volcados completos de opciones de cliente/servidor: incluían variables de entorno y argumentos del usuario, aunque ocultaran accessToken. Se conservan mensajes generales de lanzamiento. Esto no certifica un saneamiento universal de scripts del usuario, logs del juego ni toda la API heredada.

Revisión de Java automático: removeJava solo actualiza el registro; ensureJava toma su propio mutex java/componente/fuente. Su flujo de manifiesto no vuelve a tomar el mutex de instancia o packs. La prueba unitaria de locks independientes es sintética; no sustituye instalar y ejecutar Java real.

## Evidencia

- Suite del workflow: **821 pruebas, 86 archivos, 17,91 s**; 12 regresiones nuevas de LaunchService con mutex reales y spawn/watcher simulados. Comprueban espera cliente/servidor, hueco entre spawn y registro, liberación ante error, historial lento, comandos previos, parada/salida y ausencia de los marcadores sensibles de fixture en logs.
- Tipos raíz y lint aprobados. E2E tsc conserva 56 diagnósticos previos, ninguno en 46. Ambos hosts empaquetados reconstruidos; renderers sin cambios en este bloque y dist/default Vue conservados.
- **18 escenarios empaquetados distintos**: React12/22/44, diez aprobados en la primera tanda; React43/46, cuatro aprobados en 11,3 s; Vue03/08/33/45, cuatro aprobados en 20,3 s. La primera tanda también ejecutó 46 y falló por esperar launchNoProperJava en lugar del error correcto launchInvalidJavaPath para un ejecutable inexistente. Se corrigió esa expectativa exacta y se mantuvo la aserción de exclusión. 43 se ejecutó aparte porque su nombre se escribió inicialmente sin el guion; no se cuenta una ejecución inexistente.
- 46 entra en la rama real de LaunchService: retiene copyFile de un ZIP sintético en la carpeta compartida y solicita lanzar otra instancia vinculada. Comprueba que no termina durante esa copia, luego obtiene el error de ruta Java y puede escribir selección de nuevo. Se impide todo spawn de procesos del sistema en esa fixture. La comprobación temporal de 250 ms se complementa con barreras deterministas en unitarias; no prueba una partida Minecraft.
- La versión empaquetada anterior falla la aserción de espera de 46, como se esperaba. Las primeras unitarias reprodujeron la carrera y la retirada prematura del mapa. Un primer mock incompleto de stat produjo una excepción no controlada: corregido antes de la suite final. El log rojo unitario inicial conserva resultados pero elimina el volcado de argumentos que heredaba el entorno del proceso.
- Harness check y sus nueve regresiones pasan. CI40824366862 aprobó ambos renderers para f3f58cc/f34855e; esta fuente necesita su propia ejecución de CI tras push.

Comandos desde launcher: lista vitest explícita de `.github/workflows/react-migration.yml`; `pnpm check`; `pnpm lint`; `pnpm --dir e2e exec tsc --noEmit`; `LAUNCHER_RENDERER=react|vue pnpm --prefix=xmcl-electron-app build`; Playwright12/22/44 y43/46 con el EXE React,03/08/33/45 con el EXE Vue, locale es-ES y outputs separados. Desde raíz: `node launcher/scripts/react-migration.mjs check` y `node --test launcher/scripts/react-migration.test.mjs`.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-pack-startup-artifact-manifest.json`, SHA-256 `292c24d9f9ca139f179cd5233d7372416dad431183bdea557e38a7c2c147bec0`: cinco blobs Git canónicos y180 archivos de evidencia, incluidos resultados fallidos/aprobados y hashes de EXE/asar de ambos outputs mutables. No se hizo una auditoría visual nueva: la UI no cambia; los recorridos anteriores de packs conservan sus comprobaciones de accesibilidad.

## Continuidad y límites

Próximo: información/grupos/gestión de compartidos/actualizaciones de packs; shaders, mundos, ajustes de instancia y consola. Después etapas6–9. No reimplementar copia/retirada ni repetir mods por rutina. K08/K09 siguen pending hasta comprobar su paridad completa.

El bloqueo serializa preparativos de lanzamiento con cambios de packs del launcher; no protege escrituras de programas externos ni sustituye rollback ante fallos de disco. No se certifican Java/juego reales, NSIS/actualización en Windows desechable, AA manual ni presupuestos finales. Producción/proxy intactos, Microsoft pospuesto, versión beta.2 y PR4 en borrador. No DevTools/CDP, no tocar ANALISIS_ARQUITECTURA.md ni reintentar limpiezas denegadas.
