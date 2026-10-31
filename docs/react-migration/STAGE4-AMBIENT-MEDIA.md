# Etapa 4 — ambientes Vanilla y portada propia

Implementación `505ea2dc8a372c547aeb62c71a367e5a6458263e`; fixture final `bfd19c6abf9d037ff2810bc5263541e832c2e1b7`. Etapa4 activa; producción sin cambios.

Overworld conserva el clip Caves & Cliffs; Nether/End usan panorámicas reales de Xbox México bajo CC BY3.0. Se revisaron fuente/licencia, recortes y bucles antes de distribuir derivados. Tres vídeos locales de12s,1280×720,H.26424fps,sin audio:3766415bytes totales. Pósteres/miniaturas,metadatos y hashes en manifest.json; atribuciones/cambios en credits.json y [MEDIA.md](../../launcher/xmcl-react-ui/MEDIA.md). Las miniaturas están registradas en fuente; la UI usa pósteres completos. El original424MB queda ignorado y fuera del paquete. Sin IA ni instalación de shaders.

La escena decorativa se asigna de forma estable por ruta,sin leer mundos ni inferir dimensión. Los packs mantienen recursos de sus metadatos: fondo propio y portada junto al título; el vídeo indica «Ambiente Vanilla genérico; no representa este modpack». Una portada inválida no se presenta como identidad de proyecto. No se añaden búsquedas manuales de packs ni vídeos remotos.

Solo un vídeo activo; desmontar pausa,retira src y libera carga. Se precarga solo la siguiente imagen,retirada fuera de Inicio/en rendimiento/movimiento reducido/presentación desactivada. IntersectionObserver pausa vídeo/carrusel fuera de pantalla. Las pausas anteriores por foco,diálogo,interacción,juego,minimizar y manual se conservan. Desactivar vídeo o provocar error real de decodificación conserva imagen y Jugar.

## Validación

- 591 unitarias/61 archivos,13,117s;2 nuevas de asignación e integridad/atribución de medios. Tipos/lint raíz y lint React final aprobados; detector fuente UI sin hallazgos;9 harness.
- 66 React empaquetados en3,8min +1 StrictMode4,2s +2 Vue9,8s:69 distintos. Los5 casos focales y3 finales de portadas son repeticiones solapadas.
- 91Axe/0violaciones/162incompletos. Cuatro capturas finales con póster congelado revisadas:claro/oscuro1200×720/800×400. Jugar completamente visible; no certificación manual AA/RTL.
- media-analysis: tres derivados con24fps constantes,288fotogramas,12s,una pista vídeo/sin audio,decodificación íntegra PASS y0anomalías de tiempo. Son observaciones de formato, no medidas de consumo.
- Builds React y Vue aprobados;dist final Vue. [Informe JSON](STAGE4-AMBIENT-MEDIA.json):fuentes Git,comandos,paquetes y artefactos ignorados con SHA-256.

La primera validación detectó que la portada56px tapaba parte de Jugar en800×400; se corrigió a40/32px y pasó la misma aserción. Dos fixtures nuevas se corrigieron para volver a Inicio tras recarga y usar el contenedor real de scroll. El negativo de vídeo usa un Blob MP4 inválido y el decoder real porque la ruta de Playwright no interceptaba el protocolo del paquete; no acredita fallo de red. Los3 casos finales de portadas se repitieron tras congelar sus capturas con reduced-motion,con el mismo ejecutable; la reproducción se verifica aparte en30/01/12.

## Siguiente acción y límites

Medir60s de CPU renderer/GPU/conjunto de procesos,poster frente a beta.2 y5arranques equivalentes. La fixture actual graba vídeo siempre: preparar una opción acotada para desactivar grabación en mediciones,conservar comportamiento predeterminado de las regresiones. Usar app.getAppMetrics y CPU acumulada por PID+creationTime; registrar hardware,unidades,intervalos y todos los procesos. La documentación Electron indica KiB para memoria y que las llamadas reinician intervalos de percentCPUUsage; usar deltas acumuladas evita interferencias. Mantener medición separada de decodificación/formato.

No cerrar home-carousel/etapa4 con consumo pendiente. K03/K06 conservan límites de instalación/Java/juego reales; instancia avanzada,catálogo,ajustes/ventanas,retirada y publicación siguen en5–9. Microsoft pospuesto. [CI anterior40396131488](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40396131488) pasó ambas matrices para834fdc3; comprobar el propio tras push.
