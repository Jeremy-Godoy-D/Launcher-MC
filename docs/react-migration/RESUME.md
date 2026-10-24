# Punto de reanudación

## Objetivo

Implementar `PLAN.md`: React en paralelo, núcleo Java sin extras, gaming propio/barra lateral. Modpacks usan recursos que ellos proporcionan vía sus metadatos; buscar en internet los recursos Vanilla/fallback, sin generar arte IA. Publicación prevista: v0.3.0-beta.1. Referencia: v0.2.0-beta.2.

## Bloque actual

Etapas0/1/2/3 completadas. El usuario aprobó explícitamente el prototipo con fondo global y glass: «si lo apruebo», evidencia DESIGN_APPROVAL.json. Etapa4 activa: recorrido principal real. STAGE3.md/JSON registra código086a281, 54 pruebas unitarias, seis Electron, tipos/lint/build y límites. Rama: codex/react-migration; referencia Git inicial: 7671c6f1bdc471d42816241920a262a18aca5a44.

## Siguiente acción

1. Ejecutar status/check; leer SCOPE.md antes de interpretar paridad.
2. Etapa4: leer PLAN secciones de onboarding, Inicio/Biblioteca/carrusel y contratos actuales de cuentas, instancias, versiones/importación/lanzamiento antes de sustituir fixtures. Microsoft sigue pospuesto; no descartar ni modificar cuentas antiguas por ello.
3. Usar packages/renderer-client y los hooks de xmcl-react-ui/src/runtime.tsx. Claves de descriptor incluyen ruta/argumentos; no acceder a IPC desde componentes ni liberar manualmente un raw compartido que ya pertenece al store. RuntimeProvider/Intlify/preferencias están conectados en main.tsx. La UI conserva fixtures salvo preferencias/idioma; los botones de juego siguen explicados como vista previa.
4. Conectar onboarding/perfil local, instancias reales y selección válida persistida; conservar la independencia de destacada/seleccionada. Crear/importar/lanzar requieren acción explícita y confirmación de servicios, sin lanzamiento al montar ni seleccionar silenciosamente otra instancia al fallar. Validar en perfiles temporales, ambos tamaños y Strict Mode antes de cerrar cada criterio.
5. Mantener el contrato visual aprobado, recursos propios de packs y fallback Vanilla con shaders. Seguir con escenarios de inicio nuevo/actualización/datos ausentes/red; no declarar cerrada la etapa4 sin los tres criterios del harness y sus recorridos. No rehacer el prototipo ni pedir otra aprobación; logger/migration siguen sin implementación funcional.

## Restricciones y hechos que no deben perderse

- No editar ni añadir al commit `ANALISIS_ARQUITECTURA.md`.
- El usuario confirmó «Solo el núcleo propuesto, sin extras»: 26 keep, 11 remove y Microsoft deferred; no migrar IA, Bedrock, P2P, SSH, autor, browser, Big Picture ni audio/temas antiguos. El Minecraft online normal permanece.
- Microsoft sigue pospuesto. Las credenciales de CurseForge siguen únicamente en Cloudflare.
- No ejecutar el instalador sobre la instalación habitual. Probar NSIS en Windows desechable durante la etapa 9.
- La revisión visual de la etapa 1 requiere evidencia del usuario; no se reemplaza con un test verde.
- Esa aprobación ya existe: DESIGN_APPROVAL.json, «si lo apruebo». No mantenerla como bloqueo pendiente.
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
- Cliente y transporte etapa3: snapshots privados de registros/arrays, alias por ID+epoch, cola inicial/revisiones, sender adquirido, limpieza explícita. No volver al vaciado anterior con queueMicrotask. Conserva pruebas anteriores de lifecycle y protocolo Vue; spec03 comprueba una mutación real, spec04 comprueba StrictMode12 efectos/12 limpiezas y cero suscripciones/polls pendientes al terminar. Operaciones nativas en curso no se abortan: sus resultados obsoletos se liberan al resolver/cerrar la ventana.
- Preferencias: launcher.react.preferences versión1, migración de darkTheme o ThemeService.settings.dark y aurora.performanceMode; sin aplicar assets/CSS. Persistencia, fallos de storage y versiones futuras probados. Intlify11.4.0 usa los29YAML precompilados a AST; locale sigue Settings y RTL en html, nuevas cadenas es/en. Las demás cadenas del prototipo todavía requieren traducción al migrar funciones.
- Validación final etapa3: paquete React4 tests22,3s + harnessStrict1test6,4s + Vue1test7,9s. Doce informes Axe sin violaciones y doce incomplete agregados; no certificación manual AA. Logs/capturas ignorados identificados por hash en STAGE3.json. CLI DevTools sigue prohibido; usar las fixtures Playwright autorizadas.
