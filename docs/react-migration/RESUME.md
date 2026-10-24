# Punto de reanudación

## Objetivo

Implementar `PLAN.md`: React en paralelo, núcleo Java sin extras, gaming propio/barra lateral. Modpacks usan recursos que ellos proporcionan vía sus metadatos; buscar en internet los recursos Vanilla/fallback, sin generar arte IA. Publicación prevista: v0.3.0-beta.1. Referencia: v0.2.0-beta.2.

## Bloque actual

Etapas0/1/2 completadas. El usuario aprobó explícitamente el prototipo con fondo global y glass: «si lo apruebo», evidencia DESIGN_APPROVAL.json. Etapa3 activa: cliente/estados. Infraestructura y pruebas reales de paquetes en STAGE2.md/JSON; código c9b73c2. Rama: codex/react-migration; referencia Git inicial: 7671c6f1bdc471d42816241920a262a18aca5a44.

## Siguiente acción

1. Ejecutar status/check; leer SCOPE.md antes de interpretar paridad.
2. Etapa3: extraer cliente sin Vue a packages/renderer-client; revisar service.ts/syncableState.ts y preload/service.ts, contratos SharedState/ServiceChannels reales. El workspace conserva una entrada xmcl-client-vue que no existe: no confundirla con código disponible.
3. Probar inmutabilidad, suscripción compartida, cola inicial/herencia/null/cancelación/referencias y Strict Mode antes de conectar pantallas. Preload actual vacía pendingCommits en queueMicrotask; revisar carrera antes de consumidores y mantener compatibilidad Vue.
4. Después tareas/eventos e i18n/preferencias. Nueve pruebas del harness pasan. No rehacer el prototipo ni pedir otra aprobación; main/logger/migration ya compilan, auxiliares todavía sin implementación funcional.

## Restricciones y hechos que no deben perderse

- No editar ni añadir al commit `ANALISIS_ARQUITECTURA.md`.
- El usuario confirmó «Solo el núcleo propuesto, sin extras»: 26 keep, 11 remove y Microsoft deferred; no migrar IA, Bedrock, P2P, SSH, autor, browser, Big Picture ni audio/temas antiguos. El Minecraft online normal permanece.
- Microsoft sigue pospuesto. Las credenciales de CurseForge siguen únicamente en Cloudflare.
- No ejecutar el instalador sobre la instalación habitual. Probar NSIS en Windows desechable durante la etapa 9.
- La revisión visual de la etapa 1 requiere evidencia del usuario; no se reemplaza con un test verde.
- Medios reales incorporados: paisaje Vanilla con shaders, océano y clip promocional Caves & Cliffs optimizado con poster. Fuente/licencia/hash en MEDIA.md, credits.json y STAGE1.json. Packs: recursos propios de Modrinth, sin buscar reemplazos. CPU/GPU/memoria60s aún no medidos en React.
- La imagen generada quedó solo en .codex/generated_images, no se copió al proyecto. El usuario quiere buscar Vanilla en internet; para packs usar sus propios recursos. La IA interpretó erróneamente que todos los fondos debían ser Vanilla; corrección final registrada en SCOPE, no repetirla.
- Vanilla puede usar y debe priorizar paisajes con shaders ya renderizados. Son medios, no una función que instale shaders o renderice un mundo en la app.
- CLI de DevTools rechazado previamente: no reintentar ni eludir. Usar Playwright Electron autorizado.
- No borrar por otra vía la carpeta temporal cuya limpieza fue rechazada.
- Las cifras de rendimiento del plan son presupuestos, no mediciones de React.
- Etapa1 abre una ventana React adicional sobre beta.2; etapa2 ya prueba el paquete React propio. No inferir preload por URL transitoria. Foco nativo explícito antes de medir vídeo, reducedMotion=no-preference en el caso de reproducción y pruebas de ventanas secuenciales; minimizar/reduced-motion deben pausar realmente. No equivale a retirar extras de runtime ni a migrar dominio.
- Paquete React local: xmcl-electron-app/build/output/react/win-unpacked/Launcher MC.exe, ejecutar únicamente con fixtures temporales. Vue sigue como default en scripts/renderer-targets.json. Generic Electron se instaló con su install.js existente para pruebas Vue; app.getVersion() allí43.5.0 no es versión del launcher público.
- DeskGap producción compila y pasa tipos; desarrollo sin NODE_ENV=production falla aserción ASCII, no se eliminó esa comprobación ni se afirmó ejecución nativa. Workflow de migración preparado, no probado aún en GitHub.
- El harness detecta cambios del plan, evidencias ausentes o alteradas y saltos de etapa; no prueba por sí solo que una función esté correcta.
