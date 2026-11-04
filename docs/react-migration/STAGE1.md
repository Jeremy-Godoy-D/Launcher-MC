# Etapa 1 — prototipo listo para revisión visual

2026-10-24. Rama codex/react-migration. Prototipo React paralelo con fixtures explícitas; referencia de Electron v0.2.0-beta.2. No sustituye el renderer público ni implica que las funciones del núcleo ya estén migradas. Commit y hashes del árbol validado: STAGE1.json.

## Entregado

- Paquete privado xmcl-react-ui, React/TypeScript/Vite, router hash, Lucide y diálogo Radix. Dependencias fijadas en lockfile; solo añadidos relacionados. No se cambia el build:renderer predeterminado de Vue.
- Marco lateral obsidiana/cobre, Inicio con paisaje Vanilla real con shaders, destacada independiente de selección y carrusel de 30 s; Biblioteca con búsqueda/loader/cuadrícula/lista y catálogo de muestra con portadas/galerías propias de Modrinth. Corrección solicitada por el usuario: fondo ambiental de toda la ventana, sincronizado con destacada en Inicio y seleccionada en las demás vistas; glassmorphism en marco, tarjetas, búsqueda y diálogo.
- Variantes clara/oscura, lateral compacto a800px, scroll de contenido y búsqueda/fuentes visibles en el primer viewport del catálogo mínimo.
- Clip real optimizado local, poster, un único video, pausas de presentación y atribución/fuente/licencia/cambios accesibles. MEDIA.md detalla permisos y límites. Ningún recurso IA incorporado.
- Acciones de producto simuladas explícitamente; las operaciones reales, preferencias persistidas y apariencia sistema corresponden a etapas posteriores. Controles nativos usan el puente existente cuando existe.

## Validación realizada

1. `pnpm --dir launcher --filter @launcher/react-ui check`, lint y build: aprobados. Dos pruebas Vitest de política de movimiento y wrap del carrusel: aprobadas. Ocho pruebas del harness: aprobadas.
2. `pnpm --dir launcher check` y lint: runtime API, runtime, Electron y Vue aprobados; cero errores/advertencias. Los scripts raíz todavía no incluyen React: se ejecutó expresamente su chequeo propio.
3. Playwright Electron, `specs/react-migration/01-prototype.spec.ts`: **2 aprobadas, 11,3 s** en la última ejecución completa con fondo global y cristal. Perfil/datos temporales de las fixtures oficiales, actualización y juego real desactivados. El ejecutable beta.2 hospeda una ventana adicional con el renderer React compilado y su preload real; contextIsolation/sandbox activos y Node deshabilitado. No equivale al empaquetado de la etapa 2.
4. Doce capturas: Inicio/Biblioteca/Catálogo × claro/oscuro ×1200×720 y800×400. Sin overflow horizontal; imágenes visibles cargadas realmente; cero pageerror observados. Axe WCAG A/AA: cero violations en los doce casos; **color-contrast incompleto sobre imágenes**, por lo que no certifica AA completa. Capturas inspeccionadas visualmente, también por revisor independiente; falta la revisión humana acordada.
5. Recorridos: navegación, selección no alterada al cambiar destacada, Jugar captura identidad en diálogo ficticio, búsqueda/loader/vacío/limpiar/lista; lista→Inicio conserva tarjetas; catálogo vacío recuperable; Escape devuelve foco. Créditos en800×400 con botón íntegro, ratio1 y borde inferior≤alto−16.
6. Vídeo: currentTime avanza, reduced-motion pausa realmente el elemento, restauración reanuda y minimizar pausa mediante window-active. La fixture usa el preload real del paquete, comprobado antes del recorrido. FFprobe:1280×720 H.264,24fps,12s,sin audio; FFmpeg decodifica completo sin errores.
7. Fondo global cambia al navegar entre destacadas sin guardar selección. El modo rendimiento elimina el backdrop-filter de la barra lateral y del diálogo en portal; volver a desactivarlo restaura blur18px. No hay otro vídeo para el fondo global: reutiliza la imagen de presentación; el único vídeo sigue en la destacada. Blur estático en superficies acotadas, sin filtros animados de pantalla completa.

## Hallazgos corregidos y trazabilidad

La primera pasada mostró que el foco DOM emulado por Playwright no sirve como única señal de minimización. Se añadió el evento nativo window-active ya existente; una búsqueda inicial del preload por URL tomó una ventana transitoria sin puente, por lo que se corrigió a la ruta real del paquete y se comprueba el contrato antes del test. No se presenta aquella ejecución fallida como validada.

El revisor independiente detectó recientes en filas dentro de columnas al volver desde Biblioteca/lista, catálogo sin estado vacío y el botón Entendido parcialmente cortado. Se corrigieron, se añadieron regresiones y se repitió la suite completa. El veredicto final **ship se limita a esas correcciones**; no sustituye aprobación del usuario ni prueba toda la migración.

Artefactos finales: `launcher/e2e/artifacts/react-migration-prototype-glass-final.log` y directorio homónimo. Créditos: `launcher/e2e/artifacts/screenshots/es-ES/react-migration-01-prototype-spec-ts-react-prototype-independent-selection-filte/prototype-800-credits.png`. Los logs/capturas son locales ignorados; STAGE1.json conserva rutas/hashes y resumen versionado. El dev server de revisión se dejó en127.0.0.1:3001; se inicia con `pnpm --dir launcher --filter @launcher/react-ui dev` si ya no está activo.

## Revisión pendiente y límites

Se presentó la dirección al usuario mediante pregunta estructurada y vista interactiva. Respondió: «me gusta pero creo que te olvidaste de el fondo y quiero que agregues glassmorphismo». Se implementó la corrección y se repitió la validación. **Esa respuesta no es aceptación final de la versión revisada**: la etapa1 queda awaiting_review; etapa2 y posteriores pendientes.

No están conectados servicios, instalación/lanzamiento, cuentas, persistencia, i18n, actualizador, catálogos reales ni el estado de juego. Los extras XMCL siguen en el host histórico; su retirada real corresponde a etapa8. Falta CSP/integración de producción y sus comprobaciones de seguridad, todas las ventanas, fallos de red completos, mediciones60s CPU/GPU/memoria, pruebas con proceso de juego y NSIS aislado. Microsoft continúa pospuesto. Los permisos de material documentados corresponden únicamente a estas fuentes, no a cualquier captura de internet.
