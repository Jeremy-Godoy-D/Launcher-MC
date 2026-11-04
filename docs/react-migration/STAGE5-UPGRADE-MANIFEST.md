# Etapa 5 parcial — manifiesto compartido de actualizaciones

Fuente `0ae267c5612ce2dc0b88f4886da2d7ba45ea9cda`. K08 y etapa 5 permanecen pendientes.

El constructor puro buildModUpgradeManifest ahora reside en runtime-api. Vue conserva un reexport compatible y su consumidor real; React puede usar el mismo modelo sin importar Vue. Se conservan hashes, proveedor e identidad anterior y nueva. Actualizar un mod con sufijo .disabled mantiene el sufijo, incluida su variante en mayúsculas, sin duplicarlo. La regla solo se aplica a mods; packs y shaders conservan el nombre del proveedor. No se mutan los planes de entrada.

La prueba Vue anterior esperaba convertir sodium-old.jar.disabled en sodium-new.jar: ahora exige sodium-new.jar.disabled. Siete pruebas nuevas de API cubren ambos proveedores, prefijos, activados/desactivados, mayúsculas y sufijo ya presente. El workflow incluye también el caso Vue existente. Una fixture Modrinth parcial inicialmente falló tipos; se completó con los campos reales del contrato, sin relajar TypeScript.

Validación del bloque:717 unitarias en 79 archivos (18,08 s); ocho focales, con la fixture final tipada. Tipos raíz y lint aprobados. Ambos renderers y hosts reconstruidos:16 recorridos React de importación/contenido/guardas en 31,0 s y 3 Vue en 18,3 s. Diez auditorías Axe existentes sin violaciones/24 incomplete y 19 capturas; no AA manual completo. Harness: 9 pruebas. Dist y selección predeterminada quedan Vue. No cambió la UI visible ni se repitió calibración de rendimiento.

Comandos: lista explícita de `pnpm exec vitest run` del workflow; focales `xmcl-runtime-api/src/util/modUpgradeManifest.test.ts` y `xmcl-keystone-ui/src/composables/modUpgrade.test.ts`; `pnpm check`; `pnpm lint`; `pnpm build:renderer` y `pnpm --prefix=xmcl-electron-app build` por renderer. Playwright desde paquetes respectivos con specs React 14/24/38 y Vue 03/08/33, salidas únicas stage5-upgrade-manifest-react/vue. Desde raíz: harness status/check y sus nueve pruebas.

Fuentes Git, logs (incluido el fallo de tipos corregido), artefactos y hashes de cuatro binarios al capturarlos: manifiesto ignorado `launcher/e2e/artifacts/stage5-upgrade-manifest-artifact-manifest.json`, SHA-256 `1b52b22ae39e5dc4da0e6e100b298ea23f77c537325f55d120a78bb1be98d249`. Los paths de paquetes son mutables. El CI [40721432762](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40721432762), sobre f27c286/fuente 9d6ad2b, ya aprobó ambos renderers. También pasó el anterior 40717537004 sobre 1da8953/f25aab4. Esta fuente necesita CI propio tras push.

Falta conectar consultas y revisión de actualizaciones en React, con hashes/configuración comprobados por Native al publicar, cola/progreso/reanudación y errores recuperables. El constructor disponible no equivale a esa integración terminada. Reutilizar readModFilesSnapshot/validateModFileChanges sin envolver al instalador con otro lock de instancia. Después packs/shaders, mundos, ajustes, consola y etapas 6–9. Fixtures no certifican descarga real de proveedores, Java/juego, NSIS o delta; producción/proxy intactos y Microsoft pospuesto.

Se conserva la fixture .progressive-install-test-s7GPKa porque su limpieza fue rechazada por revisión automática; no reintentar ni eludir. ANALISIS_ARQUITECTURA.md permanece intacto y fuera de commits.
