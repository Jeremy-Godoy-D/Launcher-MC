# Etapa 4 — primera medición de rendimiento

Harness `6f31960`; producto empaquetado `505ea2d`. Windows11 build26100,i5-12400F,12hilos lógicos,aprox16GiB RAM,Electron43.5.0/Chromium150. Grabación/trazas desactivadas;1200×720,perfiles temporales,tres instancias sintéticas. No instalación habitual.

Cinco cargas separadas de60s,aprox31muestras cada una. CPU por deltas acumuladas de app.getAppMetrics/tiempo real,con100%=un núcleo,sin dividir entre12. Se conservaron todos los procesos/PID+creationTime y su memoria. El proceso renderer no cambió de identidad. Resultados medios:

| Estado | CPU renderer | CPU proceso GPU | CPU app sumada | RAM renderer |
| --- | --- | --- | --- | --- |
| Póster |0,131%|0,039%|0,430%|130,49MiB|
| Vídeo |1,767%|4,776%|6,674%|124,57MiB|
| Rotación |1,908%|5,210%|7,286%|130,79MiB|
| Minimizado |0,025%|0,071%|0,200%|132,66MiB|
| Rendimiento |0,027%|0,041%|0,162%|135,41MiB|

RAM: workingSetSize KiB/1024; no es heap JS ni VRAM dedicada. La CPU GPU es del proceso, no utilización física del dispositivo. Capacidad de decodificación/composición figura habilitada; no permite inferir porcentaje de GPU.

Vídeo Nether:23,9819frames/s y0perdidos; renderer<8% del presupuesto. Rotación observó Nether/End sin fotogramas perdidos. Minimizar mantuvo currentTime0,035426 y rendimiento0durante toda su ventana,con todas las muestras pausadas. No se afirma que todos los clips estén calibrados individualmente ni que los bucles de tiempo prueben juego real.

## Validación

El caso completo pasó en5,2min. Cero WEBM en su output; la opción de fixture recordVideo=false omite el grabador. La opción predeterminada mantiene grabación:02-packaged pasó3,6s y generó3WEBM,incluidas auxiliares; es repetición del escenario anterior,no caso nuevo.9harness y lint0errores/avisos de las3fuentes modificadas.

Se añadieron anotaciones HTMLVideoElement y del resultado tipado de métricas tras detectar errores en la comprobación TypeScript de E2E; no cambian el orden ni los datos medidos. Las tres fuentes nuevas/modificadas tienen0diagnósticos. El chequeo global E2E aún devuelve56diagnósticos en otras fuentes sin cambios; se conserva el log y no se retocan suites protegidas. Los tipos/lint del producto y591unidades/69escenarios del bloque anterior permanecen en STAGE4-AMBIENT-MEDIA; no se repitieron por instrumentación de pruebas. No hay cambios del runtime/renderer ni build nuevo;dist sigue Vue.

[JSON](STAGE4-PERFORMANCE-PRELIMINARY.json):fuentes Git,comandos,entorno,muestras ignoradas,hashes y límites. No cerrar etapa4 todavía.

## Siguiente medición

1. GPU física/VRAM mediante contadores Windows; registrar UTC en muestras para correlacionar con PID del proceso GPU. Se confirmó disponibilidad de GPU Engine/Utilization Percentage,pero no se registró esa carga en esta ejecución.
2. Póster frente al ZIP público beta.2,mismo perfil equivalente y condiciones; cinco arranques equivalentes por candidata/referencia y comparar medianas. ZIP disponible en launcher/e2e/artifacts/update-download-release-final/LauncherMC-0.2.0-beta.2-win-x64.zip;SHA esperado929813fac59a809e3012435ec60822e36b3a8f65c27ae40a5875f9add91702da. Verificar antes de extraer a artefactos; nunca instalar sobre la app habitual.
3. Biblioteca extensa y estabilidad de memoria/suscripciones; mods/consola/juego60s al estar integrados. Mantener pendientes de5–9 y tipos E2E anteriores.

Esta medición acredita CPU del renderer con vídeo y pausas largas en este Windows; no es certificación global de rendimiento ni publicación. Microsoft pospuesto,producción sin cambios.

[CI40398501994](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40398501994) pasó ambas matrices para2498ac5 (bloque de medios). Verificar el CI propio de este nuevo harness después del push.
