# Cierre de etapa 4 — integración del recorrido principal

Fuente `6e3b83d3c8522183810c4ff5c002b91b1ab823ed`. Se acepta la integración React/servicios de onboarding, perfiles locales, Inicio/carrusel, Biblioteca y crear/importar/lanzar. La etapa5 queda activa; Vue sigue predeterminado y producción permanece sin cambios.

## Alcance de la aceptación

La tabla5.4 del PLAN aprobado define4 como «Onboarding/local/Inicio/carrusel/Biblioteca/crear/importar/lanzar vía servicios». Sus recorridos de IPC, archivos, diagnósticos, captura de identidad, recuperación y estado de procesos están probados con los servicios y fixtures descritos en los informes previos. Las listas de proveedores, Java y procesos sintéticos no acreditan descargar Java/loaders ni una partida real. Esas comprobaciones siguen pendientes en K03/K05/K06 y en la aceptación final9. Las notas anteriores habían asociado esas pruebas finales a la gate de integración4; se aclara esta distinción sin cambiar PLAN/SCOPE ni declararlas realizadas.

- onboarding-accounts: bootstrap nativo,alta/selección/eliminación/apariencia local,persistencia y reinicio; informes ONBOARDING/ACCOUNTS/PROFILE-APPEARANCE ya registrados.
- home-carousel: orden seleccionada/últimas partidas,identidad independiente,rotación real,fallbacks/galerías/caché,tres clips autorizados,pausas y presupuestos de este informe.
- library-instance-launch: biblioteca real/virtualizada,crear/importar/operar/exportar/copiar/reanudar por servicios y coordinador de lanzamiento conectado. Evidencia CREATION/IMPORTS/PRISM/VANILLA/CLIENTS/PRISM-BASE/LAUNCH y posteriores operaciones; sin afirmar ejecución física.

K01 queda completo para sus criterios de última válida/Jugar explícito/no autolanzar/rotación independiente. K02/K04/K17 ya estaban completos. Las funciones que cruzan otras etapas mantienen su aceptación final pendiente: cabecera/contenido/ajustes/consola5,catálogo6,tareas —incluidas las de Inicio— y ventanas7,retirada8 y publicación9.

## Corrección encontrada al medir

La prueba de1.000 instancias mostró un pico observado de1.494,17MiB tras40recorridos de navegación. Un guard evita excepciones de URL para iconos vacíos,pero la causa principal era que Inicio montaba las1.000 tarjetas de «recientes». Se reprodujo con esperado3/recibido1000 y después se limitó esa vista previa a3; la Biblioteca y el carrusel conservan todas las instancias. No cambian datos,validaciones de imágenes ni servicios.

Con el arreglo,las cuatro muestras tras lotes de10recorridos fueron246,93/268,72/276,58/291,88MiB y al terminar60s de reposo178,14MiB. Biblioteca mantiene474elementos DOM,menos de40tarjetas montadas y los mismos2canales nativos de eventos. No se forzó GC ni se afirma introspección universal de listeners; la limpieza de suscripciones compartidas tiene evidencia StrictMode/unidades aparte.

## Rendimiento final en la referencia

Windows11 build26100,i5-12400F/12hilos lógicos,RTX4060 driver32.0.16.1656,aprox16GiB RAM. Sin grabador ni trazas,durante60s por carga. CPU=porcentaje de un núcleo completo,sin dividir entre12.

| Comprobación | Resultado |
| --- | --- |
| Renderer con vídeo |2,042%CPU;23,994frames/s,0perdidos |
| Rotación |2,662%CPU;destacada cambia,selección guardada idéntica |
| Minimizado/rendimiento |reloj de vídeo detenido durante60s |
| Archivos de instancia |SHA-256 de3instance.json idénticos tras las5cargas |
| Póster React frente a beta.2 |120.80MiB frente a170.29MiB;ratio0.709,presupuesto≤1,20 |
| Mediana de5reinicios calientes |0.853s frente a1.001s;ratio0.852,presupuesto≤1,10 |
| Motor GPU del launcher más ocupado |media1.378%,ponderada por solapamiento UTC exacto de60s |

La comparación usa un perfil lógico equivalente de una instancia1.21.1,oscuro,movimiento reducido y1200×720;cada renderer conserva su perfil durante los cinco reinicios. El diseño estático difiere entre versiones. Se mide hasta el nombre correcto de instancia visible,con reloj de padre y uptime main,sin afirmar arranque frío ni disponibilidad de Java/juego.

Referencia:ZIP público beta.2,141527244bytes,SHA-256 `929813fac59a809e3012435ec60822e36b3a8f65c27ae40a5875f9add91702da`,verificado antes de extraer. Release apunta a9314c12;7671c6f permanece como referencia histórica de inventario. El ZIP se ejecutó únicamente con directorios temporales,como la candidata.

Los contadores GPU registran todos los PID del launcher y memoria global del adaptador. No se suman porcentajes de motores independientes. GPU Process Memory queda como diagnóstico: [Microsoft KB4490156](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/gpu-process-memory-counters-report-wrong-value) documenta valores incorrectos;no se usa para afirmar VRAM exclusiva ni fuga. La [definición de motores GPU de Microsoft](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/) distingue utilización de motor de CPU del proceso. Valores/crudos/alcances en JSON.

## Validación y límites

591unitarias/61archivos,17,136s;tipos/lint raíz aprobados.66React3,7min +1StrictMode4,3s +2Vue10s =69escenarios funcionales distintos. Cuatro casos de rendimiento de candidata y uno de referencia se identifican aparte;repeticiones iniciales no se suman.9harness.91Axe/0violaciones/162incompletos,sin certificación AA/RTL completa. Capturas finales Home oscuro1200×720/claro800×400 y ambos perfiles estáticos revisadas. Detector de fuente UI sin hallazgos.

El TypeScript global de E2E conserva56diagnósticos en otros archivos;los cuatro de rendimiento no tienen diagnósticos y su lint da0avisos/errores. No se modifican suites protegidas ni políticas globales. Renderer/host React y host Vue reconstruidos;dist final Vue y EXE independientes. [JSON de cierre](STAGE4-CLOSURE.json) conserva fuente,comandos,paquetes,muestras,hashes y gates. CI previo40400306593 pasó ambas matrices para7bcbe79;comprobar el propio después del push.

No publicar todavía:Microsoft pospuesto,etapas5–9 pendientes,juego/Java/loaders reales,NSIS/delta Windows desechable,seguridad final y auditoría manual AA/RTL sin certificar. Las miniaturas están en fuente;el UI usa pósteres completos. Las nuevas funciones y la candidata final repetirán los presupuestos afectados.
