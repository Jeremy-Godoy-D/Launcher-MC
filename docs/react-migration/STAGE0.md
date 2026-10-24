# Etapa 0 — inventario y referencia completados

Fecha: 2026-10-23. Rama de trabajo: codex/react-migration. Código de referencia: beta.2/main `7671c6f1bdc471d42816241920a262a18aca5a44`; binarios públicos del tag v0.2.0-beta.2. No se ha sustituido la interfaz de producción.

## Plan y alcance

PLAN.md conserva las especificaciones de arquitectura, diseño, medios, pruebas y publicación. SCOPE.md incorpora la corrección confirmada por el usuario: solo núcleo Minecraft Java, sin extras de XMCL. PARITY.md identifica 26 grupos conservados, 11 retirados y Microsoft pospuesto. Los extras retirados todavía existen en la referencia Vue; no se afirma que ya estén eliminados del producto.

Inventario reproducible: 901 archivos, 325 Vue, 270 TypeScript de composables (incluyendo pruebas), cuatro HTML y 29 idiomas. Contiene hashes e imports/ServiceKeys/claves de storage/test IDs literales. No incluye .env ni valores de cuentas. Es inventario estático, no un call graph completo. Rutas/diálogos/arranque contrastados directamente con router, App, Context, servicios API y preloads; revisión de dependencias transitivas de retirada pendiente de sus etapas.

## Paquete público

- ZIP SHA-256: `929813fac59a809e3012435ec60822e36b3a8f65c27ae40a5875f9add91702da`.
- EXE SHA-256: `01233e355406b1790d45b091a8dea580841bd8ec9ab258813dce5ee9a28da624`.
- Ambos coinciden con los sidecars previamente descargados del release público.
- ZIP extraído a carpeta propia de e2e/artifacts; app.getVersion() confirmó 0.2.0-beta.2 en cada arranque.
- No se ejecutó NSIS. Fixture oficial con appData/gameData temporales, actualización automática de prueba deshabilitada y lanzamiento Java sustituido. El perfil habitual no se usó.

## Capturas y medición

24 capturas directas requeridas (seis rutas × dos tamaños × claro/oscuro); además se utilizó snap() del repositorio. Rutas: Inicio, Biblioteca, Catálogo, Ajustes, Cuentas y Mods. Capturas representativas inspeccionadas: Inicio 1200 oscuro, Inicio 800 claro, Ajustes 800 oscuro y Catálogo 1200 claro. Este inventario visual no es una certificación manual exhaustiva de AA.

Medición Windows 11 / Intel Core i5-12400F, 1200×720 oscuro, Inicio con fondo actual:

- 60,091 segundos, seis muestras.
- CPU media renderer: 0,6843 %.
- Working set medio renderer: 283.458,67 KiB (aprox. 276,82 MiB).
- Métricas de Browser/Tab/GPU/Utility conservadas en baseline.json local.
- Cero pageerror durante el recorrido.
- Cinco arranques independientes: 3,1482 / 3,2154 / 3,2187 / 3,2562 / 3,6709 segundos de process.uptime al completar la preparación del shell; mediana 3,2187 s. Es una referencia reproducible de readiness con preparación de fixture, no latencia desde doble clic ni cold-start puro.

La primera prueba visual falló al intentar clic en un selector de tema fuera de su scroll. Se ajustó el recorrido al patrón existente de foco + Enter, sin cambiar el launcher. Los cinco arranques pasaron en esa primera ejecución; la prueba visual/60 s corregida pasó por separado (1,4 min). No se presenta la ejecución inicial como completamente aprobada. La muestra usa una instancia sintética; el catálogo pudo cargar contenido real de red y no es un golden determinista de resultados.

## Harness y comprobaciones

- `node --test launcher/scripts/react-migration.test.mjs`: ocho pruebas aprobadas; incluye cambios de documentos, saltos de etapa, criterios eliminados, evidencias ausentes/alteradas/fuera del repo y revisión visual atribuida a IA.
- `node --check launcher/scripts/react-migration.mjs`: aprobado.
- `node launcher/scripts/react-migration.mjs check`: aprobado antes del cierre; repetir al registrar la etapa siguiente.
- `pnpm --dir launcher check`: runtime API, runtime, Electron y Vue sin errores.
- `pnpm --dir launcher lint`: cero errores y advertencias.
- Suites canónicas protegidas intactas. Archivo preexistente ANALISIS_ARQUITECTURA.md preservado mediante hash; no se añade al commit.

Evidencia resumida y hashes: STAGE0.json. Logs/capturas completos locales en launcher/e2e/artifacts/react-migration-baseline*, ignorados por Git. Ningún binario se añade al repositorio. El harness verifica integridad/orden/evidencias; no certifica la veracidad semántica de un informe ni sustituye una revisión humana.

## Siguiente etapa y límites

Etapa 1: prototipo React del nuevo marco, Inicio, Biblioteca y Catálogo, solo núcleo aprobado; datos de fixture, variantes/tamaños y un clip ambiental optimizado real. Mostrarlo al usuario y registrar su revisión antes de extender el diseño. Todavía no hay funciones React migradas, clips nuevos producidos ni mejoras React de consumo demostradas. Microsoft, NSIS aislado, partida real y validación de la nueva interfaz siguen pendientes.
