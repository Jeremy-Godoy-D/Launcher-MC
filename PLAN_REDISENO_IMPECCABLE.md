# Plan Maestro de Rediseño Frontend & UX — Launcher MC (`v0.1.0-beta.3` / Impeccable Design System)

> **Propósito de este documento:** Este plan define la arquitectura visual, UX, paleta de colores, tipografía, sistema de movimiento (animaciones), eliminación estricta de patrones de IA ("AI Slop") según la skill **Impeccable** (`v4.7.0`), y la hoja de ruta archivo por archivo. Está diseñado tanto para guiar la implementación inmediata como para servir de punto de continuación exacto si otro agente retoma el trabajo.

---

## 1. Diagnóstico y Reglas Anti-IA (Impeccable Craft Floor)

Aplicando las reglas de [`.agents/skills/impeccable/reference/craft-floor.md`](.agents/skills/impeccable/reference/craft-floor.md) y su detector mecánico (`impeccable.cmd detect`), **quedan terminantemente prohibidos y serán eliminados** los siguientes patrones típicos de interfaces generadas por IA:

1. **PROHIBIDO los "Eyebrows / Kickers" encima de los títulos:**
   - Eliminar todas las etiquetas pequeñas en mayúsculas con `letter-spacing` ancho sobre los `<h1>`/`<h2>` (ej. `ENTORNOS AISLADOS · MINECRAFT JAVA` encima de `Biblioteca`, `IDENTIDAD Y AUTENTICACIÓN` encima de `Cuentas`, `NAVEGACIÓN`, `SESIÓN ACTIVA`, `INFORMACIÓN DEL PRODUCTO`). El título debe hablar por sí mismo con jerarquía tipográfica real.
2. **PROHIBIDO las tarjetas anidadas dentro de tarjetas (Nested Cards):**
   - No meter `<v-card>` o cajas con borde/fondo dentro de otro `<v-card>` contenedor. Usar **divisiones por línea de 1px (`hairline rules`)**, espaciado vertical calibrado y listas estructuradas.
3. **PROHIBIDO el resplandor de neón sin offset ("Zero-offset colored halo"):**
   - Eliminar puntos brillantes tipo `shadow-[0_0_8px_#34d399]` y sombras de colores de neón alrededor de botones.
4. **PROHIBIDO declarar elevación dos veces ("Ghost Card"):**
   - Una superficie se define **o bien** por un borde estructural de `1px` sin sombra pesada, **o bien** por una sombra con desplazamiento vertical (`0 10px 24px -6px rgba(0,0,0,0.5)`), nunca combinando borde blanco brillante + halo difuso + `backdrop-filter` innecesario.
5. **PROHIBIDO emojis o glifos Unicode como iconos de interfaz:**
   - Eliminar emojis en títulos como `'🌍 ' + t('setting.globalSetting')` en `Setting.vue`. Todos los iconos deben provenir de un sistema consistente de trazos vectoriales / Material Symbols.
6. **PROHIBIDO la cuadrícula monótona de tarjetas idénticas con 6 botones de texto apilados:**
   - En lugar de repetir 6 botones (`Abrir instancia`, `Contenido`, `Configuración`, `Consola`, `Duplicar`, `Eliminar`) en cada tarjeta de la biblioteca, usar una **Estantería Interactiva (Shelf + Action Bar)**: la tarjeta muestra la identidad de la instancia, su estado y la acción primaria (`Abrir instancia`), mientras que las acciones secundarias aparecen limpiamente integradas en una barra de herramientas compacta con iconos y menú contextual al enfocar/pasar el cursor (conservando todos los `data-testid` y textos accesibles).

---

## 2. Dirección Visual y Recomendación de Paleta ("Taller Mineral / Obsidian & Terracotta")

La mayoría de los launchers genéricos o hechos con IA usan negro azulado con verde neón (`#10b981`) o morado/cian. Para que **Launcher MC** tenga personalidad de producto real, cálido, táctil y memorable (inspirado en el hardware de Teenage Engineering, Steam Deck OS y manuales técnicos impresos):

### Paleta de Colores (OKLCH / Hex Calibrado)
| Rol | Token CSS | Valor | Uso en la aplicación |
| :--- | :--- | :--- | :--- |
| **Fondo Base (Taller)** | `--mc-canvas` | `#0c0e12` | Fondo profundo principal de la ventana (grafito mineral oscuro, sin gradientes chillones). |
| **Riel Estructural (Sidebar)** | `--mc-rail` | `#12151c` | Barra lateral izquierda fija a sangre (`border-right: 1px solid var(--mc-rule)`), cálida y sólida. |
| **Superficie Elevada (Shelf)** | `--mc-surface` | `#171b24` | Filas de instancias, paneles de trabajo y cabeceras contextuales. |
| **Superficie Interactiva (Hover/Focus)** | `--mc-surface-lift` | `#1e2330` | Estado enfocado o activo de una fila/tarjeta. |
| **Regla Estructural (1px)** | `--mc-rule` | `rgba(243, 241, 236, 0.08)` | Líneas divisorias de 1px exacto (estilo `rw-centre-rail-reference-setting`). |
| **Texto Primario (Marfil Mineral)** | `--mc-ink` | `#f3f1ec` | Títulos y nombres de instancias (blanco cálido de alto contraste, nunca `#ffffff` puro). |
| **Texto Secundario (Piedra)** | `--mc-ink-muted` | `#9ca3af` | Subtítulos, rutas y descripciones (contraste WCAG AA ≥ 4.8:1 sobre `#0c0e12`). |
| **Acento Primario (Cobre / Terracota)** | `--mc-accent` | `#e06d53` | Acción principal de lanzamiento (`Jugar`, `Crear instancia`), indicador de foco activo. |
| **Acento Verificado (Jade Musgo)** | `--mc-jade` | `#3b9b78` | Estado listo, cuenta Microsoft verificada, runtime Vanilla / Fabric estable. |
| **Acento Técnico (Ocre Ámbar)** | `--mc-amber` | `#d4943a` | Modloaders pesados (Forge / NeoForge), avisos de memoria o actualizaciones pendientes. |
| **Acento Peligro (Carmesí)** | `--mc-danger` | `#d94e4e` | Errores de arranque y acciones destructivas (`Eliminar`). |

### Tipografía y Escala
- **Títulos de vista (`h1`):** `1.65rem` (`26.4px`), `font-weight: 650`, `letter-spacing: -0.025em`, `line-height: 1.2`, color `var(--mc-ink)`. Sin etiquetas encima.
- **Subtítulos de sección (`h2`):** `1.05rem` (`16.8px`), `font-weight: 600`, `letter-spacing: -0.015em`.
- **Cuerpo de lectura:** `0.875rem` (`14px`), `line-height: 1.55`, medida máxima `68ch`.
- **Datos tabulares y versiones (Java, RAM, MC Version):** `font-variant-numeric: tabular-nums`, fuente monoespaciada técnica sólo para números de versión, rutas de archivos y consola.

### Sistema de Movimiento y Animaciones (`cubic-bezier(0.22, 1, 0.36, 1)`)
1. **Transición de vista en `App.vue`:** Entrada suave con desplazamiento vertical corto (`translateY(6px)` → `0`) y opacidad en `180ms cubic-bezier(0.22, 1, 0.36, 1)` (sin rebotes lentos que bloqueen el clic).
2. **Efecto "Shelf Focus Lift" (inspirado en `pop-culture-shelf-streaming-title-card-wall`):**
   - Al pasar el ratón o enfocar con teclado una instancia en **Biblioteca** o un perfil en **Cuentas**, la tarjeta activa se eleva sutilmente (`transform: translateY(-2px)`), ilumina su regla superior con `var(--mc-accent)` y las demás tarjetas del estante atenúan ligeramente su opacidad (`0.82`), dirigiendo la atención sin ruido visual.
3. **Indicador de navegación deslizante:** En la barra lateral, el ítem activo muestra una barra vertical sólida de `3px` en color Terracota/Jade y transición suave de fondo.
4. **Respeto total a `prefers-reduced-motion: reduce`:** Desactiva transformaciones si el usuario tiene activada la reducción de movimiento en Windows.

---

## 3. Plan de Implementación Archivo por Archivo (UX + Frontend)

### Fase 1: Artefactos Impeccable y Fundamentos Globales (`common.css`, `vuetify.ts`, `App.vue`, `AppSystemBar.vue`)
- [x] **1.1. `launcher/xmcl-keystone-ui/PRODUCT.md`:** Creado con la verdad de producto validada con el usuario.
- [x] **1.2. `.impeccable/surfaces/src-windows-main-app-vue.md`:** Creado con el `Direction contract` y `seed:e32f593ad65f7ae0`.
- [ ] **1.3. `launcher/xmcl-keystone-ui/src/assets/common.css`:**
  - Reemplazar las utilidades `.lg-*` anteriores por el sistema de diseño **Impeccable Workshop** (`--mc-*` variables, `.mc-rail`, `.mc-shelf-grid`, `.mc-row`, `.mc-badge`, `.mc-hairline`, animaciones de transición de ruta `.mc-page-enter-active`, `.mc-shelf-card` con dimming de hermanos al hacer `:hover` en el contenedor, scrollbars estilizados, `::selection` personalizado y `focus-visible` nítido).
- [ ] **1.4. `launcher/xmcl-keystone-ui/src/windows/main/App.vue` y `src/views/AppSystemBar.vue`:**
  - Eliminar el punto verde brillante de neón y el chip `BETA 2` en mayúsculas.
  - Hacer que la barra de sistema superior (`AppSystemBar.vue`) se integre limpiamente con el riel izquierdo y el lienzo principal (`#0c0e12`), con botones de ventana nativos sobrios y transición de página fluida (`mc-page`).

### Fase 2: Navegación Principal y Selector de Cuenta (`LauncherNavigation.vue` y `UserAccountSwitcher.vue`)
- [ ] **2.1. `launcher/xmcl-keystone-ui/src/views/LauncherNavigation.vue`:**
  - Convertir el menú flotante en un **Riel Estructural Fijo a Sangre** (`236px`, fondo `--mc-rail`, `border-right: 1px solid var(--mc-rule)`), eliminando márgenes exteriores innecesarios y etiquetas en mayúsculas (`NAVEGACIÓN`, `INSTANCIA ACTIVA`, `SESIÓN ACTIVA`).
  - Cabecera sobria con marca tipográfica + versión en números tabulares (`0.1.0-beta.3`).
  - Bloque de instancia activa integrado mediante líneas divisorias de `1px` (`hairline rule`) en lugar de una caja pesada, mostrando el nombre de la instancia, su versión en formato tabular y las 4 sub-rutas (`Resumen y jugar`, `Contenido`, `Configuración`, `Consola`) con todos sus `data-testid`.
- [ ] **2.2. `launcher/xmcl-keystone-ui/src/components/UserAccountSwitcher.vue`:**
  - Limpiar bordes redundantes y animar la apertura del selector rápido de perfiles.

### Fase 3: Biblioteca de Instancias (`LauncherLibrary.vue`)
- [ ] **3.1. `launcher/xmcl-keystone-ui/src/views/LauncherLibrary.vue`:**
  - Eliminar la tarjeta hero gigante y el kicker en mayúsculas. Usar una **Cabecera de Trabajo Directa**: título `Biblioteca` a la izquierda con el contador integrado en línea (`X instancias`), y a la derecha el buscador compacto + botón primario `Crear instancia` (`data-testid="library-create-instance"`).
  - Barra horizontal de pestañas de filtro por modloader (`Todas`, `Vanilla`, `Fabric`, `Forge`, `NeoForge`) dibujada sobre una línea base de `1px`.
  - **Estantería de Instancias (`mc-shelf-grid`)** con interacción de foco:
    - Al pasar el cursor sobre el estante, la tarjeta enfocada se eleva suavemente mientras el resto atenúa su contraste.
    - Estructura limpia sin cajas anidadas: cabecera con nombre + insignia `Seleccionada`, línea técnica tabular (`1.21.4 · Fabric`), botón principal destacado `Abrir instancia` y fila de acciones rápidas (`Contenido`, `Configuración`, `Consola`, `Duplicar`, `Eliminar`) alineada sobre una regla de `1px`.
    - Estado vacío sobrio y directo, sin iconos gigantes de cohete con brillo de neón.

### Fase 4: Vista de Instancia Activa (`HomeHeader.vue`, `HomeFocusFooterV2.vue`, `HomeFooterCard.vue`)
- [ ] **4.1. `launcher/xmcl-keystone-ui/src/views/HomeHeader.vue`:**
  - Eliminar el contenedor flotante pesado y el punto de neón. Diseñar una cabecera editorial limpia con el nombre de la instancia a gran escala, el chip técnico (`data-testid="instance-header-runtime"`) y una barra de navegación horizontal con indicador inferior de `2px` para `Resumen`, `Contenido`, `Resource Packs`, `Shaders`, `Mundos`, `Configuración` y `Consola` (preservando todos los `data-testid="instance-tab-*"`).
- [ ] **4.2. `launcher/xmcl-keystone-ui/src/views/HomeFocusFooterV2.vue`:**
  - Integrar la barra de lanzamiento inferior con una sola elevación limpia y transiciones suaves en el botón de jugar.

### Fase 5: Cuentas, Explorador de Contenido, Ajustes y Asistente Inicial (`LauncherAccounts.vue`, `StoreEntry.vue`, `Setting.vue`, `SettingAbout.vue`, `SettingUpdate.vue`, `Setup.vue`)
- [ ] **5.1. `launcher/xmcl-keystone-ui/src/views/LauncherAccounts.vue`:**
  - Eliminar todos los kickers en mayúsculas (`IDENTIDAD Y AUTENTICACIÓN`, `SESIÓN PRINCIPAL`, `MODOS SOPORTADOS`) y las tarjetas dentro de tarjetas.
  - Disposición editorial en dos columnas separadas por una regla vertical/horizontal de `1px`: a la izquierda la cuenta activa y la lista de perfiles guardados (`data-testid="saved-account-*"`); a la derecha una nota técnica sobria sobre cuentas locales vs. Microsoft.
- [ ] **5.2. `launcher/xmcl-keystone-ui/src/views/StoreEntry.vue`:**
  - Limpiar la cabecera del buscador (`#store-search`), quitando los kickers y píldoras decorativas (`Modrinth Activo`, `Instalación directa`) que no son controles interactivos.
- [ ] **5.3. `launcher/xmcl-keystone-ui/src/views/Setting.vue`, `SettingCard.vue`, `SettingAbout.vue`, `SettingUpdate.vue`:**
  - Eliminar el emoji `'🌍 '` en `Setting.vue` y usar el icono `public`/`videogame_asset` en `SettingHeader`.
  - Eliminar el kicker en mayúsculas de `Setting.vue` y `SettingAbout.vue`, y quitar las sub-cajas anidadas en `SettingAbout.vue` reemplazándolas por una tabla de especificaciones limpia de 2 columnas con reglas de `1px`.
- [ ] **5.4. `launcher/xmcl-keystone-ui/src/views/Setup.vue`:**
  - Alinear el asistente de primera ejecución con la misma paleta mineral (`#0c0e12`) y tipografía.

### Fase 6: Detector Mecánico Impeccable, Documentación `DESIGN.md`, Verificación DevTools y Publicación `v0.1.0-beta.3`
- [ ] **6.1.** Ejecutar el detector mecánico de anti-patrones de Impeccable:
  `.\.agents\skills\impeccable\scripts\impeccable.cmd detect --json <archivos modificados>` y corregir cualquier hallazgo hasta que devuelva cero violaciones críticas.
- [ ] **6.2.** Documentar el sistema de diseño definitivo en `launcher/xmcl-keystone-ui/DESIGN.md` siguiendo `.agents/skills/impeccable/reference/document.md`.
- [ ] **6.3.** Ejecutar `pnpm check`, `pnpm lint` y `pnpm test run updater.test.ts`.
- [ ] **6.4.** Incrementar versión a `0.1.0-beta.3`, compilar con `pnpm build:renderer` y `pnpm build:all`, verificar visualmente con Chrome DevTools sobre el `.exe` empaquetado, y publicar commits + Release `v0.1.0-beta.3` en GitHub (`Jeremy-Godoy-D/Launcher-MC`).
