# Aurora Glass — Bioma esmeralda

Interfaz de escritorio de Launcher MC `0.2.0-beta.1`. Modo de uso: operar. La prioridad es seleccionar una instancia y jugar; la configuración avanzada se abre bajo demanda.

## Marco y distribución

Barra de ventana de 48 px; escenario central desplazable con espacio inferior reservado; dock flotante centrado con Inicio, Biblioteca, Catálogo, Ajustes y Cuentas. Ventana estándar de 1200×720 y mínimo de 800×400. El dock nunca cubre los controles del escenario.

Inicio muestra la instancia seleccionada, una acción Jugar, recientes y accesos al espacio de instancia. La biblioteca usa tres columnas, dos en el mínimo, y acciones secundarias en menú. Las vistas de instancia usan cabecera y navegación horizontal persistentes. El catálogo conserva resultados y scroll al mostrar una ficha mediante una ruta modal. Filtros y detalles se abren bajo demanda. Las fuentes seleccionadas muestran una marca; las omitidas, borde discontinuo y acción de añadir. Los fallos de proveedor conservan los resultados disponibles y ofrecen reintento. Los ajustes tienen búsqueda y categorías; en el mínimo, su encabezado ocupa una fila fuera del scroll. El onboarding agrupa bienvenida, cuentas y primera acción en tres etapas.

## Material y tokens

`src/assets/aurora.css` define la identidad y mantiene alias `--mc-*` para consumidores existentes.

| Token | Valor oscuro | Uso |
| --- | --- | --- |
| `--ag-canvas` | `#071311` | Fondo |
| `--ag-ink` | `#ecf7f2` | Texto principal |
| `--ag-secondary` | `#bdcfc7` | Texto secundario |
| `--ag-muted` | `#94aca1` | Metadatos |
| `--ag-accent` | `#56dbab` | Acción y selección |
| `--ag-glass` | `color-mix(in srgb,var(--color-card-bg) 88%,transparent)` | Cristal base del tema |
| `--mc-accent-ink` | `var(--mc-accent)` | Texto de controles activos y estado |

En claro, `--mc-accent-ink` mezcla el acento con `#18342a` y el texto de metadatos usa `#476254`. Así se conserva el color decorativo del tema y se aumenta el contraste de los textos pequeños. Los mensajes del catálogo usan la tinta principal sobre su superficie de advertencia.

Tres superficies: `glass-1` para marco y panel principal; `glass-2` sin blur para filas/tarjetas; `glass-3` para hojas y popovers. Los paneles internos no añaden otra capa de blur. Tipografía existente, títulos directos y sin etiquetas decorativas encima. Iconos Material Design, sin emojis.

## Movimiento, accesibilidad y rendimiento

Burbujas Canvas con composición de alfa para fusión; máximo de 30 fps y DPR 1.5. La animación se detiene con juego abierto, ventana oculta o sin foco, movimiento reducido o modo rendimiento. El color procede del icono local cuando es posible, con fallback esmeralda. No leer imágenes remotas para extraer colores.

Interacciones breves, foco visible, teclado y acciones secundarias accesibles mediante botón además del menú contextual. El modo rendimiento es una preferencia del dispositivo y no se exporta con un tema.

## Compatibilidad

Aurora se diseña en oscuro. Los temas claros y colores/assets personalizados se conservan. La migración cambia únicamente colores reconocidos del tema oscuro de beta.3; los datos de temas claros no se reemplazan. Las rutas antiguas de contenido redirigen a `/instance/...`; los servicios y almacenamiento de instancias se mantienen.

## Verificación

Pruebas en `e2e/specs/aurora/`, capturas a los dos tamaños soportados, chequeos de tipos/lint y revisión de la app empaquetada. No publicar con errores de arranque, controles cortados o integraciones sin validar.
