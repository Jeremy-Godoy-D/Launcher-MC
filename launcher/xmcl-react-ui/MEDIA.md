# Medios del prototipo React

Alcance: etapa 1, fixtures de presentación. Vanilla usa material real obtenido de internet; los modpacks usan recursos propios de sus metadatos. No se incorpora la imagen IA generada antes de la corrección del usuario. La preferencia por shaders está representada por la captura principal; no se instala ni ejecuta un shader en el launcher.

| Archivo | Procedencia y permiso | Preparación |
| --- | --- | --- |
| src/assets/ambient/vanilla-shaders.webp | [minecraft shaders graphiques, downloadsource.fr](https://www.flickr.com/photos/128776630@N02/16180013416), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Captura real con shaders, convertida a WebP; unos 52 kB. Descubierta mediante Openverse y contrastada con enlace de licencia de la página primaria. |
| src/assets/ambient/vanilla-ocean.webp | [Minecraft - Frozen ocean, Xbox México](https://commons.wikimedia.org/wiki/File:Minecraft_-_Frozen_ocean.jpg), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Imagen convertida a WebP; unos 67 kB. Metadatos y SHA-1 de original contrastados con Wikimedia Commons. |
| src/assets/ambient/vanilla-caves.mp4 y vanilla-caves.webp | [Minecraft Caves & Cliffs: Part II, Xbox MENA](https://commons.wikimedia.org/wiki/File:إعلان_تحديث_–_Minecraft_Caves_%26_Cliffs_–_Part_II.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Fragmento 30–36 s, a media velocidad, 1280×720 H.264, 24 fps, 12 s, sin audio; suavizado sigma 0.35. MP4 1.273.812 bytes; poster WebP 16.990 bytes. Es un fragmento promocional, no gameplay de la instancia ni vídeo con shaders. |

Las cifras exactas y hashes se registran en STAGE1.json; esta tabla redondea las imágenes a partir del informe de Vite. `credits.json` distribuido conserva autor, licencia/enlace, fuente, cambios y hashes de originales/resultados. El diálogo Créditos visuales muestra atribución, licencia, modificaciones y fuente. Los originales y las páginas de verificación permanecen en artefactos locales ignorados, no en el paquete.

## Recursos de proyectos

`src/project-fixtures.json` contiene una muestra pública de los endpoints `https://api.modrinth.com/v2/project/{id}`: Fabulously Optimized (1KVo5zza), Sodium (AANobbMI), Iris (YL57xq9U). Los iconos y galerías se consumen desde sus URLs de metadatos en cdn.modrinth.com; no se buscaron sustitutos en bancos de imágenes. El pack utiliza su propia destacada «Sunrise behind a hill». El catálogo de esta etapa no es una búsqueda real ni conecta CurseForge.

## Reproducción y límites

Solo Inicio reproduce un vídeo y únicamente en la instancia ficticia Bajo la superficie. Un elemento video activo; fuente local, sin audio, poster ante fallo. Pausa por movimiento reducido, rendimiento, interacción, diálogo, pausa manual, pérdida de foco/visibilidad y evento nativo window-active. Rotación a 30 s y selección independiente. Las pruebas verifican avance real de currentTime y pausa efectiva del elemento; el evento nativo evita confundir foco emulado por automatización con una ventana minimizada.

FFprobe confirmó 1280×720, 24/1 fps, 12 segundos y ausencia de stream de audio; FFmpeg decodificó el archivo completo sin errores. Las mediciones completas de CPU/GPU/memoria durante 60 s y la pausa por proceso de juego quedan para las etapas de integración/performance: este prototipo no lanza Minecraft. El vídeo genérico tampoco sustituye recursos de packs.

Antes de ampliar el manifiesto a Overworld/Nether/End, repetir la comprobación de permisos, hash, tamaño, decodificación y pausa. No asumir que cualquier imagen pública admite redistribución; los permisos aquí corresponden a estas fuentes concretas.
