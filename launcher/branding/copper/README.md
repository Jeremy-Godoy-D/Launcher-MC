# Adaptación de color autorizada

Solicitud del usuario, 2026-10-25: «haz que el logo pertenezca mejor a la aplicacion, adapta el color del logo»; conservar sus distintas versiones para cada uso.

Herramienta: editor de imágenes integrado `image_gen`, usando sus PNG como referencia de edición. Los archivos originales de `../` y del Escritorio permanecen intactos. `source-app.png` es la salida seleccionada del editor; `app-*.png` son tamaños técnicos de esa salida y `grimo.ico` es su contenedor Windows multirresolución. La conversión de formato/tamaño se hizo con System.Drawing; los colores se editaron con image_gen. Los wordmarks transparentes tienen variante oscura/clara propia, sin filtros CSS. `assets.json` registra sus hashes y procedencia.

Uso actual: icono de app en Windows/barra/navegación/ventanas auxiliares; horizontal en el onboarding amplio, oculto cuando la altura mínima necesita ese espacio para los controles. Principal e isotipo originales se conservan para otras superficies de marca. No sustituir los recursos de los modpacks por este icono.

## Prompt final del icono

EDIT the supplied Grimo Launcher application icon. This is a strict color-material adaptation of the exact existing raster icon, not a new logo. Preserve the geometry, silhouette, perspective, open-book shaped capital G, page layers, two four-point stars, layout, proportions, rounded-square container and transparency outside its rounded corners. The existing app UI is obsidian / warm copper: replace every green/emerald/mint hue with warm copper, amber and ivory; no green must remain. Background rounded square: extremely dark obsidian charcoal #10151d through #171c25, subtle dark bronze rim. Main G face: ivory #f4e4c7 highlight transitioning into warm pale copper #f4bd73. Book-page edge faces: burnished copper #ba773e and deep bronze #68472f, separated cleanly against obsidian. Stars: warm champagne copper #f4bd73, restrained highlight with no large glow. Preserve the original three-dimensional bevel logic; sharp clean edges and confident legibility at 16 and 32 pixels. Do not add words, letters, symbols, texture, a background scene, extra stars, or any new graphic. Keep precisely the supplied icon centered at the same scale and leave genuinely transparent pixels outside the existing rounded square. Output one production app icon, square 1024x1024 PNG with alpha.

## Prompts finales horizontales

Edit IMAGE 1, the supplied transparent horizontal GRIMO LAUNCHER wordmark. IMAGE 2 is only the already-approved copper color reference for the icon; never paste its rounded-square background into the wordmark. Preserve IMAGE 1 layout, exact spelling "GRIMO" and "LAUNCHER", angular letterforms, book-G monogram, two four-point stars, rules beside LAUNCHER, all proportions and transparent margins. Recolor emerald/green to burnished warm copper #ba773e with champagne #f4bd73 and ivory highlights, matching IMAGE 2. Use **[color de letras]**; the LAUNCHER subtitle and side rules are copper, readable and restrained. No green, no new elements, no drop shadow or glowing cloud, no container, no scene. This is the **[tema]** theme variant for the same desktop application, not a logo redesign. Keep a wide horizontal aspect ratio of about 2.83:1, high-resolution sharp edges, transparent PNG with genuine alpha. Do not change the spelling or arrange text on additional lines.

- `dark`: ivory #f4e4c7 lettering for an obsidian background.
- `light`: obsidian charcoal #171c25 lettering for a light background.

Se conserva la salida real seleccionada; el texto del prompt documenta la intención de edición y no promete equivalencia geométrica píxel a píxel con el original.
