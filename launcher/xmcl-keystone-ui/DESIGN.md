# Sistema de Diseño — Launcher MC («Taller Mineral»)

Este documento define el lenguaje visual, la jerarquía espacial, los tokens de color y las reglas de movimiento de **Launcher MC** (`v0.1.0-beta.3+`), diseñado siguiendo el estándar **Impeccable**.

## 1. Dirección Creativa («Taller Mineral»)
Launcher MC se concibe como un **taller táctil de escritorio** para jugadores de *Minecraft: Java Edition* en Windows. En lugar de imitar plantillas SaaS con cristal excesivo, auras de neón o cajas anidadas dentro de cajas, la interfaz descansa sobre planos minerales mate delimitados por **filetes estructurales de 1px** (`--mc-rule`) y acentos cálidos en **Terracota / Cobre** (`#e06d53`) y **Verde Musgo / Jade** (`#3b9b78`).

## 2. Paleta de Color y Tokens (`src/assets/common.css`)

| Token CSS | Valor | Propósito |
| :--- | :--- | :--- |
| `--mc-canvas` | `#0c0e12` | Lienzo principal mate de obsidiana mineral |
| `--mc-rail` | `#12151c` | Riel estructural izquierdo fijo (`236px`) y barra superior de ventana |
| `--mc-surface` | `#171b24` | Superficie de tarjetas táctiles de primer nivel (`.mc-card`) |
| `--mc-surface-lift` | `#1e2330` | Superficie elevada al pasar el cursor o enfocar (`.mc-card-interactive:hover`) |
| `--mc-surface-subtle` | `#131720` | Pie de tarjeta o banda secundaria separada por filete de 1px |
| `--mc-rule` | `rgba(243, 241, 236, 0.08)` | Filete estructural de 1px (`.mc-hairline-b`, `.mc-hairline-t`) |
| `--mc-rule-strong` | `rgba(243, 241, 236, 0.16)` | Borde activo/hover de superficies interactivas |
| `--mc-ink` | `#f3f1ec` | Texto principal cálido en marfil mineral |
| `--mc-ink-secondary` | `#c8c5be` | Texto secundario de controles y pestañas |
| `--mc-ink-muted` | `#9ca3af` | Metadatos técnicos y descripciones |
| `--mc-accent` | `#e06d53` | Acción primaria (*Jugar*, *Crear instancia*, indicador activo de 3px/2px) |
| `--mc-jade` | `#3b9b78` | Estado listo / verificado (Vanilla, Fabric, cuenta Microsoft oficial) |
| `--mc-amber` | `#d4943a` | Entornos técnicos / advertencias (Forge, NeoForge, actualizaciones) |
| `--mc-danger` | `#d94e4e` | Acciones destructivas (*Eliminar*) |

## 3. Tipografía y Datos Técnicos
- **Títulos de vista (`h1`)**: Directos y sin etiquetas *eyebrow* encima (`1.5rem`, `font-weight: 700`, `letter-spacing: -0.02em`).
- **Métricas y versiones (`.mc-tabular`)**: Todas las versiones de Minecraft (`MC 1.21.1`), conteos de instancias y métricas usan `font-variant-numeric: tabular-nums` para evitar saltos horizontales.

## 4. Arquitectura Espacial y Superficies
1. **Riel Estructural Izquierdo (`LauncherNavigation.vue`)**: Fijo a `236px`, pegado al borde izquierdo de la ventana (`border-right: 1px solid var(--mc-rule)`), con indicador activo vertical de `3px` en `--mc-accent`.
2. **Estantería Interactiva de Instancias (`.mc-shelf-grid`)**: Cuadrícula fluida (`minmax(290px, 1fr)`) donde enfocar o pasar el cursor sobre una tarjeta la eleva (`translateY(-2px)`) y atenúa sutilmente las tarjetas hermanas (`opacity: 0.84`).
3. **Elevación Declarada Una Sola Vez**: Las tarjetas `.mc-card` declaran su límite mediante un borde de `1px solid var(--mc-rule)` y radio de `10px`, sin combinar sombras difusas con bordes brillantes.

## 5. Reglas Estrictas Anti-Patrones (Craft Floor)
- **Prohibido usar etiquetas *eyebrow* en mayúsculas** sobre los encabezados (`h1`/`h2`).
- **Prohibido anidar tarjetas dentro de tarjetas**: Usar filetes estructurales de `1px` (`.mc-hairline-b` / `.mc-hairline-t`) para dividir secciones internas.
- **Prohibidos los halos de neón (`0 0 8px ...`) y las píldoras decorativas no interactivas**.
- **Prohibido usar emojis como iconos de interfaz**: Usar siempre iconos vectoriales de Material Design o SVG dedicados.
