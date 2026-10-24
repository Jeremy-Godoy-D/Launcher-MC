---
name: Launcher MC — Obsidiana y cobre
description: Paisajes reales de Minecraft a toda ventana, cristal de obsidiana y controles de cobre para volver a jugar.
colors:
  canvas: "#0e1117"
  surface: "#171e29"
  elevated: "#202a38"
  ink: "#f3f6fc"
  muted: "#b5c0d0"
  line: "#ffffff12"
  accent: "#f3b86a"
  accent-text: "#271b0d"
  hover: "#ffffff09"
  glass: "#171e29a6"
  glass-chrome: "#0e111773"
  glass-elevated: "#202a38eb"
  glass-rim: "#ffffff26"
  scene-veil: "#0e1117ba"
  light-canvas: "#f3f5f8"
  light-surface: "#fff"
  light-elevated: "#e8edf3"
  light-ink: "#17202b"
  light-muted: "#465569"
  light-line: "#17202b16"
  light-accent: "#995412"
  light-accent-ink: "#8b470a"
  light-accent-text: "#fff"
  light-hover: "#17202b07"
  light-glass: "#ffffffb8"
  light-glass-chrome: "#f3f5f8a6"
  light-glass-elevated: "#e8edf3f0"
  light-glass-rim: "#ffffffa6"
  light-scene-veil: "#f3f5f8d9"
typography:
  display:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "40px"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-1px"
  headline:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.7px"
  title:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "14px"
  label:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  icon-control: "8px"
  control: "10px"
  card: "14px"
  feature: "16px"
spacing:
  tight: "4px"
  small: "8px"
  compact: "12px"
  regular: "16px"
  spacious: "24px"
  feature: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 17px"
    height: "40px"
  button-primary-light:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-accent-text}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.glass-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 17px"
    height: "40px"
  button-play-featured:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    height: "44px"
    width: "125px"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.icon-control}"
    size: "32px"
  navigation:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "44px"
  search:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "42px"
  instance-card:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.card}"
  window-chrome:
    backgroundColor: "{colors.glass-chrome}"
    textColor: "{colors.ink}"
  dialog:
    backgroundColor: "{colors.glass-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.feature}"
---

# Design System: Launcher MC — Obsidiana y cobre

## Overview

**Creative North Star: "Obsidiana y cobre"**

Cristal de obsidiana, cobre cálido y paisajes reales de Minecraft a toda ventana forman una identidad propia dentro de la organización familiar de Xbox y Epic. La variante clara conserva la misma jerarquía y geometría. El fondo permanece visible detrás del marco y los paneles, con velos y superficies que protegen la lectura.

La profundidad se construye con transparencias, desenfoque localizado, bordes de luz y sombras suaves, con tipografía Segoe cercana a Windows. El movimiento acompaña la presentación y se detiene durante la interacción; el modo rendimiento conserva la composición con materiales opacos y sin blur. Los packs conservan sus propios recursos mediante metadatos; Vanilla y los fallbacks usan material real de internet con procedencia documentada, preferentemente con shaders ya renderizados.

**Key Characteristics:**

- Navegación lateral persistente y jerarquía visual sobria.
- Cobre para acciones principales, selección y foco.
- Paisajes reales a toda ventana, con lectura protegida por velos y degradados.
- Cristal localizado con bordes suaves, sin neón ni desenfoques interiores anidados.
- Movimiento ambiental que respeta la interacción y las preferencias del sistema.

Este documento fusiona el borrador provisional con `src/styles.css` y `src/App.tsx`, incluida la corrección visual del usuario del 2026-10-24: fondo global y glassmorphism. Esta decisión sustituye el material anterior basado solo en profundidad tonal. La aprobación visual posterior del usuario está registrada en ../../docs/react-migration/DESIGN_APPROVAL.json. Los tokens describen la fixture de etapa 1; no prueban migración funcional ni paridad. La estrategia del primer viewport y la referencia `seed:822102f6440f5816` corresponden al contrato de superficie, no a nuevas reglas globales. Los documentos de desarrollo permanecen fuera de `src` y del artefacto distribuido.

## Colors

Paleta contenida: neutrales azulados de obsidiana y un único acento de cobre. El frontmatter conserva los valores del código y es la capa normativa de tokens.

### Primary

- **Cobre cálido** (`accent`): acciones primarias en oscuro; el Jugar de la destacada conserva este tratamiento sobre imagen en ambas variantes.
- **Cobre tostado** (`light-accent`): relleno primario en superficies claras; **cobre de lectura** (`light-accent-ink`) diferencia enlaces, selección y foco.
- **Tinta de cobre** (`accent-text`, `light-accent-text`): texto del botón, según el relleno y la variante.

### Neutral

- **Obsidiana de fondo** (`canvas`, `light-canvas`): base de pantalla y fallback opaco del marco.
- **Obsidiana de superficie** (`surface`, `light-surface`): grupos sólidos y fallback opaco de tarjetas y campos.
- **Obsidiana elevada** (`elevated`, `light-elevated`): capas sólidas, selección de controles segmentados y fallback de acciones secundarias.
- **Cristal de panel** (`glass`, `light-glass`): tarjetas, búsqueda y acceso lateral de instancia.
- **Cristal de marco** (`glass-chrome`, `light-glass-chrome`): barra de ventana y lateral.
- **Cristal elevado** (`glass-elevated`, `light-glass-elevated`): diálogo y acciones secundarias, con mayor opacidad para proteger su contenido.
- **Borde de luz** (`glass-rim`, `light-glass-rim`): contorno de tarjetas, campo, hero y diálogo; borde derecho del lateral.
- **Velo de paisaje** (`scene-veil`, `light-scene-veil`): atenuación uniforme de la imagen global, aproximadamente (73%) en oscuro y (85%) en claro.
- **Tinta principal** (`ink`, `light-ink`) y **tinta secundaria** (`muted`, `light-muted`): contenido y contexto, respectivamente.
- **Separador discreto** (`line`, `light-line`) y **velo de interacción** (`hover`, `light-hover`): división y respuesta al cursor.

**The Stable Contrast Rule.** El texto y las acciones sobre medios necesitan un degradado o superficie estable; una imagen nueva exige revisar sus combinaciones reales.

Los colores puntuales de disponibilidad, cierre de ventana y sobreimpresión de imagen no constituyen todavía una escala semántica completa. El estado «Lista para jugar» de las fixtures no demuestra disponibilidad real. Las rampas del sidecar son muestras generadas para el panel, no nuevos tokens ni combinaciones aprobadas.

## Typography

**Display Font:** Segoe UI Variable, con Segoe UI y sans-serif como fallbacks.

**Body Font:** la misma familia; no hay una voz decorativa o monoespaciada adicional.

**Character:** familiar de Windows, legible y contenida. El peso y el tamaño distinguen la acción y la identidad del mundo; no se simula una tipografía de bloques de Minecraft.

### Hierarchy

- **Display** (`display`): identidad de la instancia destacada; se reduce a (33px) en el breakpoint compacto observado.
- **Headline** (`headline`): título de pantalla; se reduce a (24px) en compacto.
- **Title** (`title`): secciones de contenido.
- **Body** (`body`): base global. La descripción de la destacada utiliza (13px), interlineado (1.6) y ancho máximo (350px).
- **Label** (`label`): botones. Metadatos secundarios varían actualmente entre (10–13px); esos tamaños menores son evidencia del prototipo, no una recomendación para extenderlos a información esencial.

**The One Type Voice Rule.** Mantener Segoe y su jerarquía entre pantallas; usar cifras tabulares cuando se comparen posición, versión o progreso.

## Layout

El marco observado es una cuadrícula con barra de ventana de (40px), lateral de (224px) y contenido flexible. Por debajo de (1024px), el lateral ocupa (72px); sus accesos mantienen nombre accesible y título. La ventana principal objetivo es (1200×720), con mínimo de (800×400), no una composición móvil.

Un fondo absoluto cubre toda la cuadrícula, centrado y sin recibir eventos. En Inicio utiliza la imagen de la instancia destacada; en las demás rutas, la de la instancia seleccionada. Un velo estable atenúa el paisaje antes de colocar marco y contenido. El fondo global es una imagen: el vídeo permanece exclusivamente en la destacada.

El contenido tiene un área vertical de scroll por pantalla y una barra de herramientas independiente. El padding horizontal observado es (26px), (18px) en compacto y (38px) desde (1500px). El ritmo reutiliza los pasos del frontmatter sin convertir cada ajuste local en un token nuevo.

Biblioteca utiliza tres columnas y catálogo cuatro; ambos pasan a dos bajo el breakpoint del lateral. La vista de lista utiliza una columna. Los filtros pueden envolver en el breakpoint de (850px). La media query de altura (500px) reduce cabecera, espaciados y banner.

La destacada tiene controles al pie y mantiene su zona de acciones. Que Jugar aparezca sin desplazamiento a (800×400) es un criterio del contrato de superficie que requiere evidencia visual; las alturas mínimas actuales del hero no lo certifican. No convertir el recorte o desbordamiento de una captura en un patrón aprobado.

## Elevation & Depth

El material actual es glassmorphism sobre un paisaje global: transparencias con tinte de obsidiana, borde de luz y desenfoque localizado. Marco y diálogo utilizan `--glass-blur` (18px); tarjetas y búsqueda, (12px). Los botones y los contenidos internos no añaden una segunda capa de blur. Las tarjetas incorporan un reflejo interior tenue y sombra ambiental corta; el diálogo conserva `--shadow`, con variante oscura y clara. El sidecar conserva los valores exactos de sombras y los snippets del material porque no caben en el esquema de frontmatter.

**The Bounded Glass Rule.** Aplicar el desenfoque en el contenedor exterior, conservar la lectura con velo y opacidad, y ofrecer materiales opacos sin blur en modo rendimiento.

El modo rendimiento establece `data-performance` tanto en la raíz del documento como en la aplicación: sustituye cristales por sus superficies sólidas y desactiva el blur también en el diálogo renderizado por portal. Si `backdrop-filter` no está disponible, el CSS ofrece fondo opaco para marco, tarjetas, búsqueda y diálogo. El fondo global no tiene desenfoque animado a pantalla completa. Estas decisiones limitan el trabajo visual; CPU, GPU y memoria reales aún requieren medición.

El hero protege su lectura mediante dos degradados oscuros. El medio conserva su color; no se aplica un filtro de cobre que falsee la identidad del pack.

## Shapes

Controles, tarjetas y grandes superficies usan los radios del frontmatter. Los botones de icono tienen una curva algo menor. Avatares e indicadores de estado son circulares; las portadas se recortan dentro de su contenedor. Las líneas son delgadas y de baja presencia, sin biseles, burbujas ni brillo de neón.

## Components

### Buttons

Acciones compactas y firmes. El primario usa cobre; el secundario utiliza cristal elevado, sin blur propio. El Jugar de la destacada amplía el objetivo respecto al botón general y mantiene su cobre cálido sobre arte. Administrar sobre imagen tiene una base oscura translúcida.

Hover mezcla el relleno con la tinta o eleva su opacidad; no desplaza el objetivo. El foco visible global es un contorno de (2px), separado (4px); el campo de búsqueda separa su contorno (2px). El estado disabled reduce opacidad y desactiva el cursor de acción.

### Chips

La etiqueta de loader sobre portada es informativa, con base oscura translúcida y forma compacta. No representa selección ni filtro. Su tamaño actual es una muestra de fixture, no una nueva escala recomendada.

### Cards / Containers

Tarjetas de instancia y proyecto unen imagen recortada, identidad y acciones visibles sobre cristal de panel. Borde de luz, reflejo interior y desenfoque exterior definen el material; el cuerpo no aplica blur adicional. La identidad utiliza icono propio del proyecto cuando existe. Jugar y opciones permanecen disponibles sin hover. El modo lista conserva identidad y acciones en una fila; el resultado vacío ofrece limpiar la búsqueda.

### Inputs / Fields

Búsqueda: cristal de panel, borde de luz, blur exterior y contorno de foco en el contenedor. El input interior hereda la tinta y no añade un segundo borde ni desenfoque. Los selectores conservan su comportamiento nativo sobre superficie sólida. Errores y validación conectados al dominio todavía no están documentados como componentes implementados.

### Navigation

Icono y etiqueta, estado activo mediante cobre y un tinte del fondo. Hover aumenta contraste sin cambiar posición. El lateral compacto conserva accesos a navegación, instancia, ajustes y cuenta; ocultar la etiqueta visual no elimina el nombre accesible. Los iconos implementados son Lucide; las animaciones de AnimateIcons/Motion siguen pendientes.

### Featured carousel

La destacada es una presentación independiente de la instancia seleccionada. Anterior, pausa y siguiente tienen posición estable; las acciones capturan la instancia mostrada. Rotar no persiste una selección. Navegar manualmente pausa la rotación.

El código de fixture condiciona movimiento a interacción, diálogo, foco, actividad nativa, visibilidad, reducción de movimiento y modo rendimiento. Usa poster, vídeo sin audio y fallback de imagen; una sola destacada monta su vídeo. Las transiciones observadas son (160ms ease-out) en controles y (250ms ease-out) en opacidad del vídeo. Reducir movimiento desactiva transiciones y animaciones. La pausa por un proceso de juego real y los presupuestos de decodificación requieren integración y medición posteriores.

### Dialogs

Cristal elevado con borde de luz, blur exterior, oscurecimiento de fondo y cierre visible. Radix gestiona el modal; el código guarda el disparador y restaura foco. El modo rendimiento elimina el blur incluso fuera del árbol visual de la aplicación, gracias al estado en la raíz. Los diálogos actuales explican acciones de ejemplo y créditos: no equivalen a flujos funcionales migrados. La columna flexible limita el alto, conserva título, descripción y acción sin encogerse, y permite scroll en la lista de créditos. Los formularios reales deberán conservar esa separación al añadirse.

## Do's and Don'ts

### Do:

- **Do** mantener superficies estables detrás de texto y acciones sobre medios.
- **Do** conservar el paisaje global y el cristal localizado, con fallback opaco y modo rendimiento sin blur.
- **Do** usar recursos propios de cada pack mediante sus metadatos y conservar su identidad.
- **Do** usar medios reales Vanilla/fallback con fuente, autor y licencia; priorizar shaders ya renderizados.
- **Do** conservar foco visible, nombres accesibles y pausa contextual sin desplazar controles.
- **Do** comprobar ambas variantes y el tamaño mínimo antes de extender un patrón.

### Don't:

- **Don't** usar arte IA ni sustituir indiscriminadamente el arte de packs por paisajes Vanilla.
- **Don't** reintroducir burbujas, editor de temas, CSS personalizado o neón genérico.
- **Don't** anidar blur en contenidos internos ni añadir vídeo o desenfoque animado a pantalla completa.
- **Don't** convertir datos, textos de disponibilidad o acciones de fixture en capacidades de producción.
- **Don't** afirmar aprobación humana, contraste completo o rendimiento medido a partir de este documento.
