# Etapa 9 — rendimiento en Windows de referencia

Cinco pruebas de `pnpm --dir e2e exec playwright test specs/react-performance --workers=1 --retries=0` pasaron en 11 minutos con el ASAR `3852997d060b81bf06a32f82a733956878778b3101b277a32fe0b2ba3ab632e7`. Windows 11 build 26100, Intel i5-12400F, 12 hilos y NVIDIA RTX 4060. Sin grabación ni trazas durante la medición.

| Inicio, 60 s por carga | CPU renderer | CPU sumada del launcher |
| --- | --- | --- |
| Póster | 0,730 % | 2,492 % |
| Vídeo | 2,419 % | 9,182 % |
| Rotación | 2,164 % | 8,478 % |
| Minimizado | 0,027 % | 0,222 % |
| Modo rendimiento | 0,120 % | 0,395 % |

Los porcentajes son equivalentes a un núcleo y se calculan con deltas de CPU acumulada. El vídeo midió 23,994 fps y cumplió el máximo de 24 fps del recurso. Minimizado y modo rendimiento mantuvieron el tiempo del vídeo fijo. La rotación cambió la destacada sin modificar la selección. La prueba de GPU recogió 34 muestras y 476 mediciones válidas de motores en la ventana de vídeo. Los contadores se conservan por motor y PID. La memoria del adaptador es de toda la máquina.

Con el mismo perfil estático y cinco arranques equivalentes, la mediana fue 0,768 s frente a 1,001 s de beta.2. El conjunto de trabajo mediano del renderer fue 121,36 MiB frente a 156,43 MiB. Las diferencias de −23,3 % en arranque y −22,4 % en memoria cumplen los presupuestos del plan.

La biblioteca de mil instancias mantuvo 479 elementos DOM y el mismo inventario de listeners IPC en 40 recorridos. La memoria creció durante los recorridos y cayó durante el reposo posterior. Pasó de 292,59 a 181,16 MiB en esa ventana. La memoria privada cayó de 228,71 a 116,93 MiB. Es evidencia del recorrido medido y se complementa con las pruebas de limpieza de suscripciones y Strict Mode.

Mods mantuvo búsqueda y regreso a 500 filas durante 60 segundos. El renderer acumuló 1,404 s de CPU entre la primera y última muestra. La consola recibió 12.000 líneas en 30 lotes durante otros 60 segundos y mantuvo menos de 100 entradas visibles. Acumuló 0,604 s de CPU en el intervalo muestreado. Los archivos `stage9-final-performance` guardan muestras, resultados y capturas.

En el ZIP final, LabyMod mantuvo Minecraft abierto mientras el launcher recuperó el foco. Las 31 muestras durante 60,366 s encontraron el vídeo pausado y `currentTime` fijo en 0. El contador pasó de cero a cuatro frames decodificados, sin avance de reproducción. El PID seguía listo al terminar. `stage9-final-portable/.../game-open-performance.json` conserva las muestras de vídeo y de procesos.
