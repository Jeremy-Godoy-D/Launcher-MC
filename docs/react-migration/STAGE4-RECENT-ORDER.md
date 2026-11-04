# Etapa 4 — orden de Inicio y últimas partidas

Fuente: `93321cfcdc15d03d320a6cac5895e8401ce79172`. Etapa4 activa; Vue y producción permanecen como antes.

Inicio muestra primero la instancia seleccionada válida y después las últimas partidas reales registradas. Fechas de partida iguales o desconocidas mantienen el orden nativo. Biblioteca ofrece orden manual, nombre y «Última partida»; sus empates y la selección inicial sin preferencia usan el acceso/creación históricos. Se ignoran fechas negativas o no finitas. No se añaden escrituras de actividad: el plugin nativo ya actualiza lastPlayedDate al iniciar Minecraft.

La destacada conserva su identidad ante cambios de orden; si se retira, avanza a la siguiente superviviente del orden anterior. La selección guardada sigue siendo independiente y una ruta guardada ausente no se sustituye silenciosamente. Rotar no modifica ni la selección ni los bytes de instance.json. Administrar/Jugar siguen siendo acciones explícitas.

## Validación

- Tres regresiones empaquetadas fallaron antes del cambio y pasaron después (6,3s), incluidas también en el recorrido completo.
- 589 unitarias/60 archivos en17,59s;10 nuevas.64 React en3,8min +1 StrictMode en4,1s +2 Vue en9,9s:67 escenarios distintos.9 pruebas del harness.
- Tipos y lint raíz, comprobación React, generador de testIDs, detector de fuentes UI y builds aprobados. Dist final Vue, paquetes independientes.
- 91 informes Axe:0 violaciones/162 incompletos. Inicio oscuro1200×720 y claro800×400 revisados; no hay cambio de distribución. No certificación manual AA/RTL.
- Fuente, comandos, hashes de Git/paquetes y64 artefactos ignorados en [JSON](STAGE4-RECENT-ORDER.json). El historial E2E es sintético mediante editInstance; no acredita una partida.

K02 completo con este orden y las evidencias anteriores de búsqueda/filtros/grupos/selección/vistas/virtualización/persistencia. K03/K06 y la gate library-instance-launch conservan los límites de instalación/Java/juego reales; no se cierran por metadatos sintéticos. K04/K17 ya estaban completos.

## Siguiente bloque y límites

Completar tres clips Overworld/Nether/End, precarga del siguiente póster, vídeo genérico identificado junto a portada propia y presupuestos60s. El vídeo Xbox Masterclass de Xbox México ya está descargado solo en artefactos ignorados y analizado:1314,164s,VP9 1920×1080,aprox59,948fps,Opus estéreo. Commons registra CC BY3.0; se están revisando segmentos Nether/End antes de incorporar derivados. No se distribuye el original424MB ni se afirma que una captura sea un clip. Registrar atribución/licencia/cambios/hashes antes de empaquetar.

[CI anterior40391709529](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40391709529) pasó React/Vue para378fea2; comprobar el propio después del push. Etapas5–9, juego/Java reales, instalador/delta en Windows desechable y publicación pendientes. Microsoft pospuesto.
