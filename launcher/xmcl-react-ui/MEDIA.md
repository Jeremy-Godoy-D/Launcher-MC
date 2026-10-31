# Medios de la interfaz React

Alcance: presentación ambiental React; servicios y datos integrados por etapas. Vanilla usa material real obtenido de internet; los modpacks usan recursos propios de sus metadatos. No se incorpora la imagen IA generada antes de la corrección del usuario. La preferencia por shaders está representada por la captura principal; no se instala ni ejecuta un shader en el launcher.

| Archivo | Procedencia y permiso | Preparación |
| --- | --- | --- |
| src/assets/ambient/vanilla-shaders.webp | [minecraft shaders graphiques, downloadsource.fr](https://www.flickr.com/photos/128776630@N02/16180013416), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Captura real con shaders, convertida a WebP; unos 52 kB. Descubierta mediante Openverse y contrastada con enlace de licencia de la página primaria. |
| src/assets/ambient/vanilla-ocean.webp | [Minecraft - Frozen ocean, Xbox México](https://commons.wikimedia.org/wiki/File:Minecraft_-_Frozen_ocean.jpg), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Imagen convertida a WebP; unos 67 kB. Metadatos y SHA-1 de original contrastados con Wikimedia Commons. |
| src/assets/ambient/vanilla-caves.mp4 y vanilla-caves.webp | [Minecraft Caves & Cliffs: Part II, Xbox MENA](https://commons.wikimedia.org/wiki/File:إعلان_تحديث_–_Minecraft_Caves_%26_Cliffs_–_Part_II.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Fragmento 30–36 s, a media velocidad, 1280×720 H.264, 24 fps, 12 s, sin audio; suavizado sigma 0.35. MP4 1.273.812 bytes; poster WebP 16.990 bytes. Es un fragmento promocional, no gameplay de la instancia ni vídeo con shaders. |

Las cifras exactas y hashes se registran en STAGE1.json; esta tabla redondea las imágenes a partir del informe de Vite. `credits.json` distribuido conserva autor, licencia/enlace, fuente, cambios y hashes de originales/resultados. El diálogo Créditos visuales muestra atribución, licencia, modificaciones y fuente. Los originales y las páginas de verificación permanecen en artefactos locales ignorados, no en el paquete.

## Recursos de proyectos

`src/project-fixtures.json` contiene una muestra pública de los endpoints `https://api.modrinth.com/v2/project/{id}`: Fabulously Optimized (1KVo5zza), Sodium (AANobbMI), Iris (YL57xq9U). Los iconos y galerías se consumen desde sus URLs de metadatos en cdn.modrinth.com; no se buscaron sustitutos en bancos de imágenes. El pack utiliza su propia destacada «Sunrise behind a hill». El catálogo de esta etapa no es una búsqueda real ni conecta CurseForge.

## Tres ambientes empaquetados

`src/assets/ambient/manifest.json` registra Overworld (`vanilla-caves`), Nether y End: vídeo,póster,miniatura,dimensiones,duración,fps,ausencia de audio,bytes y SHA-256.12s,1280×720,H.26424fps,sin audio; total3766415bytes,menos de5MiB/clip y15MiB total. `credits.json` atribuye también pósteres/miniaturas. Unidades comprueban integridad/atribuciones; FFprobe y decodificación completa verifican propiedades reales.

Nether/End: [Xbox Masterclass — Xbox México](https://commons.wikimedia.org/wiki/File:Xbox_Masterclass_%E2%80%93_TIPS_y_consejos_para_ser_un_experto_en_Minecraft.webm), [CC BY3.0](https://creativecommons.org/licenses/by/3.0/). La ficha identifica canal,fuente YouTube y revisión de licencia. Original SHA-256 `b7e3e59617ea42da54962f056bc6b1ba6722185a0d8fe18715d886a6a3ff7290`,424513524bytes; solo en artefactos ignorados,no distribuido. VP9 1920×1080~59,948fps,Opus,1314,164s.

- Nether:1120,05–1122,85s; recorte1536×864 en192,108,escalado720p,ida/vuelta y tiempo×15/7 para12s. MP4 1291662bytes.
- End:1130–1133s; mismo recorte/escalado,ida/vuelta y tiempo×2 para12s. MP4 1200941bytes.

El recorte retira subtítulos/HUD de esas panorámicas. Inversión/ralentización forman bucles de material real,sin IA ni shaders en estos clips. Overworld conserva el fragmento promocional Caves & Cliffs documentado arriba. Las imágenes con shaders siguen como fallback/paisaje de ventana. No representan partidas de las instancias ni implican aval de Xbox/Mojang.

Asignación decorativa estable por ruta: no lee mundos ni infiere dimensión/versión/contenido. Packs conservan imagen propia del proveedor como fondo de ventana y portada junto al título; vídeo local con etiqueta «Ambiente Vanilla genérico; no representa este modpack». Sin portada válida no se inventa identidad. No buscar imágenes de packs ni reproducir vídeo remoto arbitrario.

## Reproducción y límites

Solo Inicio reproduce un vídeo; las otras áreas son estáticas. Cabecera de instancia en etapa5. El elemento anterior pausa/libera src al desmontar; nuevo usa póster local y fallos mantienen imagen. Precarga solo imagen siguiente,nunca otro vídeo; se retira fuera de Inicio o en rendimiento/movimiento reducido/presentación desactivada. Caché pública conserva garantías nativas50MiB.

Pausa por región fuera de pantalla,movimiento reducido,rendimiento,interacción/foco dentro,diálogo,pausa manual,juego,pérdida de foco/visibilidad/minimizar. Carrusel30s y selección independiente. Sin streaming YouTube ni audio.

Análisis fuente/derivados ignorados; informe de etapa con hashes. Presupuestos60s CPU/GPU/memoria/arranque pendientes junto a revisión manual AA/RTL. Formato/pausa no acreditan consumo.
