# Selección de shaders y rutas físicas de Windows

Fuente de producto `9998ede`; prueba de diagnóstico corregida en `3bc95701969062b2471d926bf8edddd4ae864833`. Etapa 5 sigue activa. Este bloque sustituye el estado WIP de selección descrito en el seguimiento anterior; no completa K10.

## Comportamiento implementado

React lista y busca shaders locales; detecta Iris, Oculus y OptiFine según runtime y metadatos Native alineados con los archivos. Permite activar/desactivar y volver a leer. Sin motor, con varios motores o con metadatos pendientes, no escribe una selección. OptiFabric por sí solo no cuenta como OptiFine. Las configuraciones y nombres Unicode persisten tras recargar. El launcher no ejecuta ni renderiza estos shaders.

La escritura requiere instancia Java registrada, un motor disponible, snapshot vigente y ningún proceso propio de Minecraft. Usa los locks compartido/instancia del arranque. Solo admite un nombre ZIP o carpeta local validada; rechaza enlaces ajenos y configuraciones compartidas por hardlink. Escribe mediante temporal exclusivo, sync y rename; revalida archivos/configuración/contexto antes de reemplazar. Conserva comentarios, campos desconocidos, saltos de línea y bytes Latin-1 de Java Properties; admite escapes Unicode, continuaciones, separadores y claves duplicadas con último valor efectivo. Lecturas y tamaños están limitados. Los getters/setters legacy usan el mismo lector/escritor para no confundir espacios, signos igual o escapes.

Se contrastó el formato con [IrisConfig oficial](https://raw.githubusercontent.com/IrisShaders/Iris/1.21.1/common/src/main/java/net/irisshaders/iris/config/IrisConfig.java) y la separación OptiFine/puente con [OptiFabric](https://github.com/Chocohead/OptiFabric). Detectar un motor no certifica compatibilidad GPU ni una partida real.

## Windows y CI

CI40885472006 terminó: Vue aprobado; React 125 aprobados, 8 fallidos y 2 omitidos. Los fallos de compartidos no se consideran resueltos remotamente todavía.

La reproducción empaquetada usa ahora una raíz TEMP propia bajo el alias real DOCUME~1. Su JSON shared-path-identity prueba que fs.realpath mediante callback devuelve Documents para el enlace y DOCUME~1 para el destino, mientras fs.promises.realpath devuelve el mismo destino físico en ambos casos. isLinkTo usa esta última API y comparación de rutas apropiada a Windows. Conserva la comprobación previa de que exista un enlace; una carpeta privada no se convierte en compartida. También conserva el destino literal de enlaces colgantes y rechaza destinos distintos. La prueba 51 valida observar, recargar y copiar a privado sin perder los packs comunes.

## Validación ejecutada

- Suite del workflow: **910 pruebas, 95 archivos**, aprobadas en 20,99 s; incluye parser, guardas Native y compatibilidad legacy. Harness check y sus 9 pruebas aprobados.
- pnpm check completo aprobado; después del ajuste de rutas, check de runtime y pnpm lint aprobados, sin avisos de lint. E2E tsc conserva exactamente sus **56 diagnósticos anteriores**, sin nuevos en los archivos de este bloque; no se declara limpio el typecheck global E2E.
- React empaquetado: **24 escenarios distintos aprobados**: 43/46/48/49/51/52 (20) y los cuatro de 12-launch. El lote de 20 terminó 19/20 porque la primera instrumentación de 51 usaba require en un contexto donde no existe; se corrigió a process.getBuiltinModule y 51 pasó por separado, también con raíz 8.3. No se modifica ninguna expectativa funcional para aceptar el resultado.
- Los 7 escenarios de 52 cubren los cuatro motores, ausencia/conflicto, cambios externos rechazados y una acción nueva explícita. Sus ZIP/JAR son fixtures sintéticas, nunca shaders ejecutados en Minecraft. Preserva archivos, otras instancias y mundos.
- **12 revisiones Axe de Shaders, 0 violaciones y 20 incomplete acumulados**, en claro/oscuro, 1200×720/800×400 y motor disponible/ausente/ambiguo. Son comprobaciones de contraste/enlace sobre superficies superpuestas; se conservan para revisión manual. Inspeccionadas capturas de ambos tamaños y temas, foco visible y scroll alcanzable; no equivale a certificar AA manual de toda la app.
- Vue empaquetado: 03/08/33/45, **4 aprobados en 25,5 s**. Ambos hosts reconstruidos, renderer/dist compartido restaurados a Vue. Producción/proxy intactos; Microsoft pospuesto.

Comandos desde launcher: pnpm check; pnpm lint; pnpm exec vitest run con la lista exacta del workflow; pnpm --dir e2e exec tsc --noEmit. Builds con LAUNCHER_RENDERER=react y después vue. Playwright con XMCL_E2E_EXECUTABLE al EXE del renderer elegido, XMCL_E2E_LOCALES=es-ES y los specs 12/43/46/48/49/51/52 o Vue03/08/33/45. Logs stage5-shaders-*.log y outputs propios identifican cada ejecución, incluidos los fallos iniciales corregidos.

Manifiesto ignorado launcher/e2e/artifacts/stage5-shaders-manifest.json, SHA-256 `267c4961fdecbf25ee9ba3ef98ef3738c5558ce99749f4f073895c4f5dcb077c`: 23 blobs Git canónicos y 277 artefactos. Identifica EXE/ASAR y diferencia fuente de host React de la corrección exclusiva de diagnóstico. No recorre sharing-temp-alias ni el TEMP general.

## Siguiente bloque y límites

Implementar archivos locales de shaders, información/grupos, compartidos y actualizaciones; después mundos, ajustes y consola. K08/K09/K10 y las tres gates de etapa 5 siguen pendientes, además del catálogo y las etapas 6–9. Verificar el CI nuevo tras push. Faltan instalación/Java/juego reales, NSIS/delta aislados y presupuestos finales. No publicar v0.3.0-beta.1 todavía. No reintentar DevTools/CDP ni limpiezas denegadas; no tocar ANALISIS_ARQUITECTURA.md.
