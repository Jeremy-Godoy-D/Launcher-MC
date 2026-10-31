# Información y grupos de shaders

Fuente `4470ad73cf8c75bf7644ba0901ae7580c95a31b7`. Etapa 5 y K10 siguen pendientes; este bloque completa información local y grupos, conservando la selección, importación y retirada anteriores.

La ficha muestra nombre, ZIP/carpeta, bytes del ZIP, SHA-1 válido y procedencia pública cuando existe. No presenta el tamaño stat de una carpeta como total de sus archivos ni afirma compatibilidad con GPU/Minecraft. Los metadatos se renderizan como texto, sin HTML ni navegación remota. Escape cierra la ficha y devuelve el foco; cambiar de instancia la desmonta y volver a leer actualiza su identidad.

Los grupos reutilizan `InstanceModsGroupService` y su validación/escritura Native: crear, asignación múltiple, filtrar, renombrar y disolver. Se guardan exclusivamente en `shaderpacks-groups.json`; no migran `modsGrouping`. Un archivo inválido bloquea la edición; una modificación externa rechaza el formulario revisado, conserva sus campos y permite descartarlo y volver a leer. Durante la edición se bloquean las acciones de archivos que competirían con ella. No se añadieron servicios, dependencias ni cambios al runtime.

La inspección de capturas detectó desbordamiento interno con grupos largos. El test inicial solo comprobaba el documento: se amplió para comprobar el área y todos sus ancestros. La prueba reforzada falló antes de corregir el CSS. El editor usa una columna `minmax(0,1fr)` y sus controles, filtros y selector de asignación respetan el ancho disponible. La corrección compartida se volvió a probar también en mods y resource packs.

## Validación

- Lista unitaria completa del workflow: **939 pruebas / 97 archivos**, aprobadas en 19,37 s. Incluye dos casos nuevos para procedencia múltiple, escape de texto, checksum inválido y tamaño desconocido de carpetas; los helpers y la persistencia de grupos mantienen su cobertura existente.
- `pnpm check` y `pnpm lint` completos aprobados. Check/lint React repetidos después del CSS, 0 errores/avisos. E2E TypeScript conserva exactamente los **56 diagnósticos anteriores**, sin nuevos; se corrigió la anotación `Element` del assert geométrico. No se declara E2E tsc limpio.
- Electron empaquetado final: **28 recorridos distintos** en `32/47/52/53/54/56`, aprobados en 1,5 min. Comprueban grupos de los tres dominios; selección/importación/retirada; configuración, archivos, mundos y otra instancia conservados; JSON inválido, edición concurrente, recarga, teclado y retorno de foco.
- La matriz nueva de 56 captura información/editor en claro/oscuro y **1200×720 / 800×400**. **8 informes Axe: 0 violaciones / 14 incomplete**. Capturas inspeccionadas: información claro 800, editor oscuro 800 y ficha oscuro 1200; sin desbordamiento interno después de la corrección. No equivale a una certificación AA manual.
- Se construyeron renderer y EXE React; se restauró `dist` con el compilador Vue. Este cambio afecta React/CSS y pruebas; no se reconstruyó ni volvió a probar un host Vue sin cambios. La producción permanece en beta.2 y Vue continúa predeterminado.

Comandos desde `launcher`: `pnpm exec vitest run` con la lista del workflow; `pnpm check`; `pnpm lint`; `pnpm --dir e2e exec tsc --noEmit`; `LAUNCHER_RENDERER=react pnpm gen:testids`, `build:renderer`, `build`; Playwright con `XMCL_E2E_EXECUTABLE` al EXE propio y `XMCL_E2E_LOCALES=es-ES`, specs 32/47/52/53/54/56. Al terminar: `LAUNCHER_RENDERER=vue pnpm --prefix=xmcl-electron-app compile`. El workflow incluye 56.

El CI **[40989902958](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40989902958)** del commit anterior `72eb84057bd32b9092867384691bef6f5b8f031d` terminó aprobado en ambos jobs: 937 unitarias por job, 147 React + 1 cliente estricto + 5 Vue; dos pruebas de proveedores vivos omitidas. Confirma las correcciones 8302808 de fixtures 12/48. No acredita automáticamente la fuente nueva: consultar el CI de su próximo push.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-shader-information-manifest.json`, SHA-256 `5a1a6368f22e68c7c0fe901e82406a6e73af29dec52844680c329a2aa46be71a`: 11 blobs Git canónicos y 169 artefactos, incluidos el fallo de desbordamiento previo, lote final, capturas, Axe, logs y EXE/ASAR. Solo se recorrieron directorios explícitos propios; no `sharing-temp-alias`.

## Continuidad

Próximo: gestión revisada de carpetas compartidas y actualizaciones de shaders reutilizando packs/instalador; después mundos, ajustes y consola. K08/K09/K10 y las tres gates 5 permanecen pendientes; también etapas 6–9. Faltan catálogo/superficies, retirada final de extras y validación/publicación integral. Microsoft pospuesto. Fixtures sintéticas; no acredita shaders/Minecraft/Java reales, NSIS/delta aislados ni los presupuestos finales de rendimiento.
