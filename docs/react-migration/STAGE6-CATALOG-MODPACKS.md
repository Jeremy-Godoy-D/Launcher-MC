# Descarga verificada e importación desde el catálogo

Etapa6 continúa activa. Este bloque conecta modpacks de Modrinth/CurseForge al importador existente; **K15/K16/catalog-install siguen pendientes**. Producción beta.2, Microsoft pospuesto y PR4 en borrador. No se repiten las áreas aceptadas0–5.

## Cambio

Aplicación `62094d8`, implementación inicial `81e58fc`, fixtures finales `97c8118`. La versión seleccionada captura proyecto/versión/archivo e icono, descarga mediante ModpackService.installModapckFromMarket y entrega el archivo a AddInstance. El usuario revisa y confirma antes de crear. Se conservan upstream, importedOptions, instalación/reanudación nativas y datos existentes; no se lanza Minecraft al abrir/importar.

La hoja se cierra antes del importador: una sola superficie modal, scroll/filtros y foco conservados. Las versiones mantienen su estado al cambiar de pestaña. Una creación ya registrada conserva nombre, archivo y carpeta; otra descarga muestra un aviso y no la reemplaza. Este flujo crea una instancia nueva; actualizar packs existentes permanece pendiente.

La frontera nativa copia selectores acotados y descarta directory/domain/rutas del renderer. Exige IDs solicitados y proyecto esperado cuando se proporcionó, juego Minecraft en CF, nombres sin colisiones y tamaño/checksum válidos. No sustituye silenciosamente el archivo MR solicitado. CF sin descarga disponible falla cerrado y ofrece la web de origen.

Cada descarga tiene un directorio privado estable. Verifica SHA-1/MD5 antes de publicar el archivo temporal; también verifica el cache MD5. La tarea downloadModpack cancela metadatos/transferencia y presenta bytes agregados. Un fallo de validación del helper conserva un destino previo. Se mantienen clientes y proxy CF existentes; no se introduce una key en el renderer ni se modifica el Worker.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Selección Vitest del workflow, independiente y con cuatro workers | **1434 pruebas/141 archivos,28,38s** |
| pnpm check completo | runtime-api/runtime/Electron main+preload/Vue/renderer-client/React pasan |
| Check DeskGap y lint | pasan; cero errores de lint, advertencias anteriores conservadas |
| E2E TypeScript | exactamente56 diagnósticos normalizados preexistentes, ninguno nuevo |
| React empaquetado62094d8 | **17 escenarios distintos**: primero01 aceptado; después16/35,1s: segundo01,seis93,nueve94 |
| Axe | **20 informes,0 violaciones,36 incomplete**; no equivale a auditoría manual exhaustiva |
| Vue empaquetado97c8118 | **tres Native/10,0s**,03 y los dos proveedores86 |
| DeskGap, NODE_ENV=production y LAUNCHER_RENDERER=vue | build0, guard ASCII intacto; no prueba funcional de DeskGap |

Spec94 comprueba packs sintéticos reales de ambos formatos, doble clic, confirmación, upstream/runtime/overrides, exclusión de comandos/Java del XML, cancelación de metadatos y bytes con reintento, hash/ID/proyecto incorrectos, creación pendiente y CF no disponible. Comprueba cierre HTTP, limpieza del staging propio y ausencia de creación prematura. El recorrido800×400 exige bytes de progreso y Cancelar accesible. Hay capturas de importación/catálogo en ambos temas/tamaños; se revisaron importación y progreso compacto, con scroll y pie accesibles. Los errores nativos provocados por la fixture son deliberados; no hay pageerror del renderer.

Comandos desde launcher: `pnpm check`, check DeskGap, `pnpm lint`, E2E tsc con comparación normalizada; selección Vitest del workflow con `--maxWorkers=4 --reporter=dot`. Compilar cada renderer con `LAUNCHER_RENDERER=react|vue pnpm build:renderer`, después `pnpm --prefix xmcl-electron-app build`. Native usa el EXE propio y `XMCL_E2E_LOCALES=es-ES`, worker1/retries0/max-failures1. React:01/93/94; después solo el caso fallido01 y93/94. Vue:03/86. DeskGap: `NODE_ENV=production LAUNCHER_RENDERER=vue pnpm --prefix deskgap-app build`.

La red remota se redirige solo en el salto HTTP propio de main a servidores locales; clientes/protocolo/proxy siguen reales. No se sustituyó fetch ni se usó DevTools/CDP. Identidades EXE/ASAR/HTML: stage6-modpack-final-react-identity.json y stage6-modpack-vue-identity.json. Host Vue restaurado; React sigue opt-in hasta8.

Manifest ignorado stage6-modpack-manifest.json: **bc568df3ec57567d5cde54ba5672c4cf5b7162e61e28cf1060bfae31a2e90eb0**,27 fuentes/246 artefactos. Identifica ejecuciones aceptadas y diagnósticas; documentos/harness posteriores quedan fuera para evitar circularidad.

## Fallos y correcciones

El primer94 pasó ocho casos y falló al pulsar una tarjeta del proveedor previo. La fixture ahora espera su identidad; los tres seleccionados siguientes pasaron y finalmente pasan los nueve en62094d8. No se añadieron reintentos.

CI41417352091/7edfda4: Vue success, React failure en01/93. El01 aún esperaba búsqueda inmediata/tres tarjetas del prototipo: se adaptó al catálogo real, envío explícito y HTTP propio. Una primera adaptación devolvía vacío también para la consulta inicial y esperaba ignorar su cache fresco; se corrigió a vacío por término sin desactivar el cache. Se retuvo el primer caso visual válido y solo se repitió el fallido.

El93 reveló una carrera real: fuente/filtro consecutivos podían recuperar parámetros anteriores. RouterProvider usa la entrada DOM y el catálogo actualiza la navegación síncronamente. La regresión pulsa fuente y cambia tipo en una misma ejecución, exige ambos parámetros/aviso y pasa sin ampliar tiempos. CI incorpora94 y los nuevos selectores; verificar el siguiente push sin reiniciar el run terminado.

## Siguiente trabajo

K15/K16/catalog-install: destino operativo y estado instalado/actualización para contenido; dependencias MR/CF, conflictos/opcionales/compatibilidad, revisión de altas/actualizaciones y recuperación. Reutilizar resolveFromMarket y previewInstanceFiles/installInstanceFiles, ampliando cuidadosamente el guard de packs para altas seguras. Conectar la actualización de packs desde ficha/Biblioteca al flujo nativo de upstream. La descarga/importación nueva ya está validada. Revisar cancelación de POST de metadatos al integrar actualizaciones.

Después7 globales,8 defaultReact/recorte y9 QA, instalador/actualización en Actions Windows desechable y publicación0.3.0-beta.1. No se ejecutaron partida real, referencia GPU/CPU, instalador, actualización ni publicación. Estas fixtures no validan la cuota o secreto del Worker real.
