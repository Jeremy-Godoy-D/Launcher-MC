# Etapa 2 — compilación paralela y paquete Windows

2026-10-24. Implementación: commit c9b73c2 en codex/react-migration. El usuario aprobó explícitamente la etapa1: DESIGN_APPROVAL.json. La versión pública no cambia; no se publicó ni ejecutó un instalador.

## Implementación

- LAUNCHER_RENDERER=vue|react, validado contra una selección cerrada; por defecto **vue** en renderer-targets.json. Build/dev, Electron, sus URLs y DeskGap consumen el mismo selector. Los paquetes mantienen dist independientes; el host copia únicamente el renderer seleccionado.
- React tiene entradas index.html, logger.html y migration.html. Los auxiliares son pantallas de infraestructura honestas, todavía sin operaciones conectadas. El browser histórico no tiene entrada React: una referencia antigua apunta temporalmente a index hasta la retirada completa de etapa8.
- Windows React se empaqueta en build/output/react, separado de la salida habitual. MP4 incluido en el filtro de archivos. El manifiesto local identifica renderer=react. Versionado público e identidad de instalación permanecen.
- React utiliza aislamiento de contexto y sandbox, sin Node ni webviewTag. Dev React omite instalar la extensión de Vue. No se modifican servicios de dominio, proxy ni credenciales.
- Check/lint raíz incluyen React. El generador acepta Vue/TSX y testId literal, conserva TESTIDS.md y crea TESTIDS.react.md para React; no resuelve expresiones dinámicas arbitrarias. Harness adaptado para conservar el default Vue, con regresión específica.
- Workflow react-migration.yml: matriz Windows Vue/React, checks/build/smoke, permisos de lectura y sin publicación/secrets. YAML validado localmente; todavía no ejecutado en GitHub.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Tipos/lint raíz, Electron/React y tipos DeskGap | Aprobados. Scripts del selector/generador también pasan lint. |
| Selector, política de medios y configuración del empaquetador | 8 pruebas Vitest aprobadas. |
| Harness | 9 pruebas aprobadas; check de integridad/archivos protegidos aprobado. |
| Selector sin variable | Compiló Vue y pasó verify-bundle, 0 helpers huérfanos. |
| LAUNCHER_RENDERER=react build:renderer + build Electron | Paquete Windows x64 generado, Electron43.5.0; salida win-unpacked bajo build/output/react. |
| ASAR de React | Tres HTML, MP4 presente, sin browser.html ni documentos de desarrollo. No afirma todavía que el runtime entero esté libre de extras. |
| Suite React sobre ese ejecutable | **3 aprobadas,16,3s**: doce vistas, navegación/foco/filtros/pausas y arranque real principal/auxiliares, vídeo del paquete decodificado, aislamiento/sandbox/Node/webview comprobados. |
| Vue actual con Electron local | Arranque nuevo canónico **1 aprobada,1 fixme preexistente**,7,3s. Compatibilidad con instancia sintética propia **1 aprobada**,5,4s. |
| DeskGap NODE_ENV=production, renderer React | Compila host ASCII, copia renderer y genera bridges; tipos aprobados. No se ejecutó el host nativo DeskGap. |

Las fixtures usan directorios temporales y no lanzan Minecraft. La versión reportada por app.getVersion() al ejecutar Electron genérico es43.5.0; no es el paquete público beta.2. Por eso no se modificó el test de referencia beta.2 para hacerlo pasar con ese ejecutable: se añadió una comprobación propia de compatibilidad. La suite canónica mantiene su fixme intacto.

Durante la preparación se detectaron: Electron local no descargado (se ejecutó su install.js existente), interop ESM/CommonJS de DeskGap (se adaptó siguiendo su patrón de namespace/default existente) y pruebas de vídeo sin garantizar foco nativo (se añadió la precondición explícita, sin forzar reproducción ni anular pausas). La ejecución final completa de React pasó. Las pruebas de ventanas se ejecutaron secuencialmente para no competir por el foco.

El build de desarrollo de DeskGap sin NODE_ENV=production falla su aserción ASCII; producción sí pasa. No se atribuye ese defecto al selector sin comprobar la referencia anterior ni se afirma soporte de ese arranque de desarrollo. Queda documentado para revisar al trabajar ese host; no se eludió la aserción.

## Evidencia y siguiente etapa

STAGE2.json conserva commit/hashes de fuentes, ejecutable/ASAR, comandos y artefactos locales. Logs/capturas en e2e/artifacts/react-migration-stage2-* están ignorados. No hay push, PR, publicación o instalación sobre el perfil habitual.

Etapa3: cliente independiente del framework, snapshots inmutables, suscripciones/cola inicial, tareas/eventos, traducciones y preferencias. La UI sigue usando fixtures; no declarar funciones de producto migradas por haber completado infraestructura. Microsoft, NSIS aislado, juego real, seguridad completa y mediciones de rendimiento siguen pendientes según el plan.
