# Punto de reanudación

## Objetivo

Implementar `PLAN.md`: React en paralelo, núcleo Java sin extras, gaming propio/barra lateral. Modpacks usan recursos que ellos proporcionan vía sus metadatos; buscar en internet los recursos Vanilla/fallback, sin generar arte IA. Publicación prevista: v0.3.0-beta.1. Referencia: v0.2.0-beta.2.

## Bloque actual

Harness y etapa 0 completados. Etapa 1: prototipo React construido y validado con fixtures; el usuario pidió extender fondo a toda la ventana y añadir glassmorphism. Corrección implementada y probada; pendiente de su revisión final, evidencias en STAGE1.md/JSON. Rama: `codex/react-migration`; referencia Git inicial: `7671c6f1bdc471d42816241920a262a18aca5a44`.

## Siguiente acción

1. Ejecutar status/check; leer SCOPE.md antes de interpretar paridad.
2. Recoger revisión del prototipo actualizado (fondo global+glass) en http://127.0.0.1:3001; si el servidor terminó, pnpm --dir launcher --filter @launcher/react-ui dev. Ya hay doce capturas y dos pruebas Electron aprobadas en react-migration-prototype-glass-final; no reconstruir el prototipo desde cero. No tratar «me gusta pero… agrega glassmorphism» como aprobación de la versión revisada.
3. Si solicita cambios, implementarlos y repetir las comprobaciones afectadas; si lo acepta, registrar referencia real de su respuesta en user-design-review y cerrar etapa1.
4. Solo después, etapa2: selector/build/entradas empaquetadas main/logger/migration, Vue por defecto hasta etapa8. Adaptar guard del harness para probar que el selector conserva ese default.

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
- La fixture nueva abre ventana React desde beta.2 usando su index-preload.js real y comprueba windowController.on; no inferir el preload de una ventana transitoria por URL. Pausa nativa window-active evita el foco DOM emulado. No equivale al paquete React completo ni a la retirada de extras.
- El harness detecta cambios del plan, evidencias ausentes o alteradas y saltos de etapa; no prueba por sí solo que una función esté correcta.
